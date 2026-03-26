import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:permission_handler/permission_handler.dart';
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

  final _imageCaptionController = TextEditingController();
  bool _imagePrimary = false;
  bool _cameraPermissionGranted = false;
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
    unawaited(_syncCameraPermissionState());
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

  Future<void> _saveMenuItem({
    required String name,
    required int price,
    int? menuId,
  }) async {
    final r = _restaurant;
    if (r == null) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      if (menuId == null) {
        await _api.createMenuItem(restaurantId: r.id, name: name, price: price);
      } else {
        await _api.updateMenuItem(menuId: menuId, name: name, price: price);
      }
      await _bootstrap();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _saving = false);
    }
  }

  Future<void> _openMenuItemDialog({MenuItemModel? item}) async {
    final nameController = TextEditingController(text: item?.name ?? '');
    final priceController = TextEditingController(
      text: item != null ? item.price.toString() : '',
    );

    await showDialog<void>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(item == null ? 'Thêm món mới' : 'Sửa món'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                autofocus: true,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Tên món'),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: priceController,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                decoration: const InputDecoration(labelText: 'Giá (VND)'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () async {
                final name = nameController.text.trim();
                final rawPrice = priceController.text.trim();
                final price = int.tryParse(rawPrice);

                if (name.isEmpty || price == null || price <= 0) {
                  if (!mounted) return;
                  ScaffoldMessenger.of(this.context).showSnackBar(
                    const SnackBar(content: Text('Vui lòng nhập tên món và giá hợp lệ.')),
                  );
                  return;
                }

                Navigator.of(context).pop();
                await _saveMenuItem(name: name, price: price, menuId: item?.id);
              },
              child: Text(item == null ? 'Thêm món' : 'Lưu thay đổi'),
            ),
          ],
        );
      },
    );

    nameController.dispose();
    priceController.dispose();
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

  Future<void> _syncCameraPermissionState() async {
    final status = await Permission.camera.status;
    if (!mounted) return;
    setState(() {
      _cameraPermissionGranted = status.isGranted;
    });
  }

  Future<void> _requestCameraPermission() async {
    final status = await Permission.camera.request();
    if (!mounted) return;

    setState(() {
      _cameraPermissionGranted = status.isGranted;
    });

    if (status.isPermanentlyDenied) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Camera permission is permanently denied. Please enable it in app settings.')),
      );
      await openAppSettings();
      return;
    }

    if (!status.isGranted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Camera permission is required to capture images.')),
      );
    }
  }

  Future<void> _pickImageFromGallery() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 82,
      maxWidth: 1600,
      maxHeight: 1600,
    );
    if (file == null) return;
    setState(() => _pickedImage = file);
  }

  Future<void> _captureImageFromCamera() async {
    if (!_cameraPermissionGranted) {
      await _requestCameraPermission();
      if (!_cameraPermissionGranted) {
        return;
      }
    }

    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 82,
      maxWidth: 1600,
      maxHeight: 1600,
      preferredCameraDevice: CameraDevice.rear,
    );
    if (file == null) return;
    if (!mounted) return;
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
    } on DioException catch (e) {
      final message = _dioMessage(e);
      final status = e.response?.statusCode ?? 0;
      setState(() {
        _error = status >= 500
            ? 'Upload image failed due to temporary server issue. Please try again in a few seconds. Details: $message'
            : 'Upload image failed (HTTP $status): $message';
      });
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
            child: AnimatedBuilder(
              animation: _tabController,
              builder: (context, _) {
                return IndexedStack(
                  index: _tabController.index,
                  children: [
                    _overviewTab(r),
                    _menuTab(r),
                    _tagsTab(r),
                    _imagesTab(r),
                  ],
                );
              },
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
        FilledButton.icon(
          onPressed: _saving ? null : () => _openMenuItemDialog(),
          icon: const Icon(Icons.add),
          label: const Text('Thêm món mới'),
        ),
        const SizedBox(height: 14),
        Text(
          'Danh sách món',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 16),
        if (r.menu.isEmpty)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0x22000000)),
            ),
            child: const Text('No menu items yet. Add your first item above.'),
          ),
        ...r.menu.map(
          (m) => Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
              title: Text(
                m.name,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text('${m.price} VND'),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    tooltip: 'Sửa món',
                    onPressed: _saving ? null : () => _openMenuItemDialog(item: m),
                    icon: const Icon(Icons.edit),
                  ),
                  IconButton(
                    tooltip: 'Xóa món',
                    onPressed: _saving ? null : () => _deleteMenuItem(m),
                    icon: const Icon(Icons.delete),
                  ),
                ],
              ),
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
          onPressed: _saving ? null : _requestCameraPermission,
          icon: Icon(
            _cameraPermissionGranted ? Icons.check_circle : Icons.camera_alt_outlined,
          ),
          label: Text(
            _cameraPermissionGranted ? 'Camera permission granted' : 'Request camera permission',
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _saving ? null : _captureImageFromCamera,
                icon: const Icon(Icons.camera_alt),
                label: const Text('Capture photo'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _saving ? null : _pickImageFromGallery,
                icon: const Icon(Icons.photo_library),
                label: Text(_pickedImage == null ? 'Choose from gallery' : 'Selected: ${_pickedImage!.name}'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        if (_pickedImage != null)
          Text(
            'Selected image: ${_pickedImage!.name}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        const SizedBox(height: 8),
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
