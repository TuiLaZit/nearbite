import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'dart:async';

import '../../core/auth/session_store.dart';
import '../../core/models/menu_item_model.dart';
import '../../core/models/restaurant_image_model.dart';
import '../../core/models/restaurant_model.dart';
import '../../core/models/tag_model.dart';
import '../../core/network/api_client.dart';
import '../../services/backend_api.dart';
import '../auth/role_selection_screen.dart';

class OwnerDashboardScreen extends StatefulWidget {
  const OwnerDashboardScreen({super.key, required this.apiClient});

  final ApiClient apiClient;

  @override
  State<OwnerDashboardScreen> createState() => _OwnerDashboardScreenState();
}

class _OwnerDashboardScreenState extends State<OwnerDashboardScreen>
    with SingleTickerProviderStateMixin {
  late final BackendApi _api;
  late final TabController _tabController;

  bool _loading = true;
  bool _saving = false;
  String? _error;

  RestaurantModel? _restaurant;
  List<TagModel> _allTags = const [];
  final Set<int> _selectedTagIds = <int>{};

  final _nameController = TextEditingController();
  final _latController = TextEditingController();
  final _lngController = TextEditingController();
  final _avgEatController = TextEditingController();
  final _poiRadiusController = TextEditingController();
  final _descriptionController = TextEditingController();

  final _menuNameController = TextEditingController();
  final _menuPriceController = TextEditingController();
  int? _editingMenuId;

  final _imageCaptionController = TextEditingController();
  bool _imagePrimary = false;
  XFile? _pickedImage;
  StreamSubscription<void>? _sessionExpiredSub;

  @override
  void initState() {
    super.initState();
    _api = BackendApi(widget.apiClient);
    _tabController = TabController(length: 4, vsync: this);
    _sessionExpiredSub = SessionExpiredBus.instance.stream.listen((_) {
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => RoleSelectionScreen(apiClient: widget.apiClient)),
        (route) => false,
      );
    });
    _bootstrap();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _latController.dispose();
    _lngController.dispose();
    _avgEatController.dispose();
    _poiRadiusController.dispose();
    _descriptionController.dispose();
    _menuNameController.dispose();
    _menuPriceController.dispose();
    _imageCaptionController.dispose();
    _tabController.dispose();
    _sessionExpiredSub?.cancel();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      var ownerAuthed = await _api.ownerCheck();
      if (!ownerAuthed) {
        await Future<void>.delayed(const Duration(milliseconds: 300));
        ownerAuthed = await _api.ownerCheck();
      }
      if (!ownerAuthed) {
        if (!mounted) return;
        Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (_) => RoleSelectionScreen(apiClient: widget.apiClient)),
          (route) => false,
        );
        return;
      }

      final restaurant = await _api.getOwnerRestaurant();
      List<TagModel> tags = const [];
      try {
        tags = await _api.getAdminTags();
      } catch (_) {
        // Owner can continue without full tag catalog if endpoint is temporarily unavailable.
      }

      _nameController.text = restaurant.name;
      _latController.text = restaurant.lat.toString();
      _lngController.text = restaurant.lng.toString();
      _avgEatController.text = restaurant.avgEatTime.toString();
      _poiRadiusController.text = restaurant.poiRadiusKm.toString();
      _descriptionController.text = restaurant.description ?? '';

      setState(() {
        _restaurant = restaurant;
        _allTags = tags;
        _selectedTagIds
          ..clear()
          ..addAll(restaurant.tags.map((e) => e.id));
      });
    } on DioException catch (e) {
      setState(() => _error = _dioMessage(e));
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _loading = false);
    }
  }

  String _dioMessage(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] != null) {
      return data['error'].toString();
    }
    return e.message ?? 'Request failed';
  }

  Future<void> _logout() async {
    await _api.ownerLogout();
    await SessionStore.instance.clear();

    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => RoleSelectionScreen(apiClient: widget.apiClient)),
      (route) => false,
    );
  }

  Future<void> _saveRestaurant() async {
    final r = _restaurant;
    if (r == null) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _api.updateRestaurant(
        restaurantId: r.id,
        name: _nameController.text.trim(),
        lat: double.parse(_latController.text.trim()),
        lng: double.parse(_lngController.text.trim()),
        avgEatTime: int.parse(_avgEatController.text.trim()),
        poiRadiusKm: double.parse(_poiRadiusController.text.trim()),
        description: _descriptionController.text,
      );
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _saveMenuItem() async {
    final r = _restaurant;
    if (r == null) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      final name = _menuNameController.text.trim();
      final price = int.parse(_menuPriceController.text.trim());

      if (_editingMenuId == null) {
        await _api.createMenuItem(restaurantId: r.id, name: name, price: price);
      } else {
        await _api.updateMenuItem(menuId: _editingMenuId!, name: name, price: price);
      }

      _menuNameController.clear();
      _menuPriceController.clear();
      _editingMenuId = null;
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _deleteMenuItem(MenuItemModel item) async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _api.deleteMenuItem(menuId: item.id);
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _saveTags() async {
    final r = _restaurant;
    if (r == null) return;

    final currentTagIds = r.tags.map((e) => e.id).toSet();
    final toAdd = _selectedTagIds.difference(currentTagIds);
    final toRemove = currentTagIds.difference(_selectedTagIds);

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      for (final id in toAdd) {
        await _api.attachTag(restaurantId: r.id, tagId: id);
      }
      for (final id in toRemove) {
        await _api.detachTag(restaurantId: r.id, tagId: id);
      }
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, imageQuality: 90);
    if (file == null) return;
    setState(() => _pickedImage = file);
  }

  Future<void> _uploadImage() async {
    final r = _restaurant;
    final file = _pickedImage;
    if (r == null || file == null) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _api.uploadAndSaveImage(
        restaurantId: r.id,
        filePath: file.path,
        caption: _imageCaptionController.text,
        isPrimary: _imagePrimary,
        displayOrder: r.images.length,
      );
      _pickedImage = null;
      _imageCaptionController.clear();
      _imagePrimary = false;
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _deleteImage(RestaurantImageModel image) async {
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await _api.deleteImage(imageId: image.id);
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final r = _restaurant;
    if (r == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Owner Dashboard')),
        body: const Center(
          child: Text(
            'No assigned restaurant',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        title: Text(r.name),
        actions: [
          IconButton(onPressed: _bootstrap, icon: const Icon(Icons.refresh)),
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
        bottom: TabBar(
          controller: _tabController,
          onTap: (index) {
            if (_tabController.index != index) {
              _tabController.animateTo(index);
            }
          },
          tabs: const [
            Tab(text: 'Overview'),
            Tab(text: 'Menu'),
            Tab(text: 'Tags'),
            Tab(text: 'Images'),
          ],
        ),
      ),
      body: Column(
        children: [
          const SizedBox(height: 8),
          if (_error != null)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.errorContainer,
              padding: const EdgeInsets.all(12),
              child: Text(_error!),
            ),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _overviewTab(r),
                _menuTab(r),
                _tagsTab(r),
                _imagesTab(r),
              ],
            ),
          ),
          if (_saving)
            const Padding(
              padding: EdgeInsets.all(8),
              child: LinearProgressIndicator(),
            ),
        ],
      ),
    );
  }

  Widget _overviewTab(RestaurantModel r) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Visits: ${r.visitCount}'),
        Text('Avg visit duration: ${r.avgVisitDuration}s'),
        Text('Avg audio duration: ${r.avgAudioDuration}s'),
        const SizedBox(height: 16),
        TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Name')),
        const SizedBox(height: 10),
        TextField(controller: _latController, decoration: const InputDecoration(labelText: 'Latitude')),
        const SizedBox(height: 10),
        TextField(controller: _lngController, decoration: const InputDecoration(labelText: 'Longitude')),
        const SizedBox(height: 10),
        TextField(controller: _avgEatController, decoration: const InputDecoration(labelText: 'Avg eat time (min)')),
        const SizedBox(height: 10),
        TextField(controller: _poiRadiusController, decoration: const InputDecoration(labelText: 'POI radius (km)')),
        const SizedBox(height: 10),
        TextField(
          controller: _descriptionController,
          decoration: const InputDecoration(labelText: 'Description'),
          maxLines: 4,
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving ? null : _saveRestaurant,
          child: const Text('Save Restaurant'),
        ),
      ],
    );
  }

  Widget _menuTab(RestaurantModel r) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          controller: _menuNameController,
          decoration: const InputDecoration(labelText: 'Menu item name'),
        ),
        const SizedBox(height: 10),
        TextField(
          controller: _menuPriceController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(labelText: 'Price'),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            FilledButton(
              onPressed: _saving ? null : _saveMenuItem,
              child: Text(_editingMenuId == null ? 'Add item' : 'Update item'),
            ),
            const SizedBox(width: 8),
            if (_editingMenuId != null)
              OutlinedButton(
                onPressed: () {
                  setState(() {
                    _editingMenuId = null;
                    _menuNameController.clear();
                    _menuPriceController.clear();
                  });
                },
                child: const Text('Cancel edit'),
              ),
          ],
        ),
        const SizedBox(height: 16),
        ...r.menu.map(
          (m) => ListTile(
            title: Text(m.name),
            subtitle: Text('${m.price} VND'),
            trailing: Wrap(
              spacing: 8,
              children: [
                IconButton(
                  onPressed: () {
                    setState(() {
                      _editingMenuId = m.id;
                      _menuNameController.text = m.name;
                      _menuPriceController.text = m.price.toString();
                    });
                  },
                  icon: const Icon(Icons.edit),
                ),
                IconButton(
                  onPressed: _saving ? null : () => _deleteMenuItem(m),
                  icon: const Icon(Icons.delete),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _tagsTab(RestaurantModel r) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _allTags
              .map(
                (tag) => FilterChip(
                  selected: _selectedTagIds.contains(tag.id),
                  label: Text('${tag.icon ?? ''} ${tag.name}'),
                  onSelected: (selected) {
                    setState(() {
                      if (selected) {
                        _selectedTagIds.add(tag.id);
                      } else {
                        _selectedTagIds.remove(tag.id);
                      }
                    });
                  },
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: _saving ? null : _saveTags,
          child: const Text('Save tags for restaurant'),
        ),
      ],
    );
  }

  Widget _imagesTab(RestaurantModel r) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        OutlinedButton.icon(
          onPressed: _saving ? null : _pickImage,
          icon: const Icon(Icons.photo_library),
          label: Text(_pickedImage == null ? 'Pick image' : _pickedImage!.name),
        ),
        TextField(
          controller: _imageCaptionController,
          decoration: const InputDecoration(labelText: 'Caption'),
        ),
        SwitchListTile(
          title: const Text('Set as primary'),
          value: _imagePrimary,
          onChanged: (value) => setState(() => _imagePrimary = value),
        ),
        FilledButton(
          onPressed: (_saving || _pickedImage == null) ? null : _uploadImage,
          child: const Text('Upload image'),
        ),
        const SizedBox(height: 16),
        ...r.images.map(
          (img) => Card(
            child: ListTile(
              leading: img.imageUrl.isNotEmpty
                  ? Image.network(img.imageUrl, width: 52, height: 52, fit: BoxFit.cover)
                  : const Icon(Icons.image_not_supported),
              title: Text(img.caption ?? 'No caption'),
              subtitle: Text(img.imageUrl),
              trailing: IconButton(
                onPressed: _saving ? null : () => _deleteImage(img),
                icon: const Icon(Icons.delete),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
