from app import app, db, Restaurant, MenuItem

with app.app_context():
    r1 = Restaurant(
        name="Bún bò Huế cô Ba",
        lat=10.7765,
        lng=106.7009,
        description="Quán bún bò truyền thống hơn 20 năm",
        avg_eat_time=25,
        is_active=True
    )

    r2 = Restaurant(
        name="Bánh mì cô Hoa",
        lat=10.7752,
        lng=106.7021,
        description="Bánh mì nóng giòn, nhân đầy đặn",
        avg_eat_time=10,
        is_active=True
    )

    r3 = Restaurant(
        name="Phở Minh",
        lat=10.7740,
        lng=106.6995,
        description="Phở bò gia truyền, nước dùng đậm đà",
        avg_eat_time=30,
        is_active=True
    )

    r4 = Restaurant(
        name="Cơm Tấm Tuấn Ngọc",
        lat=10.7736,
        lng=106.6966,
        description="Cơm tấm sườn nướng đậm vị, ăn cùng chả, bì, nước mắm",
        avg_eat_time=25,
        is_active=True
    )

    r5 = Restaurant(
        name="Quán Lươn Thanh Tuấn",
        lat=10.7725,
        lng=106.6951,
        description="Chuyên các món về lươn",
        avg_eat_time=50,
        is_active=True
    )

    db.session.add_all([r1, r2, r3, r4, r5])
    db.session.commit()

    menu_items = [
        MenuItem(name="Bún bò đặc biệt", price=45000, restaurant_id=r1.id),
        MenuItem(name="Bún bò giò", price=40000, restaurant_id=r1.id),
        MenuItem(name="Bún bò tái", price=42000, restaurant_id=r1.id),

        MenuItem(name="Bánh mì thịt", price=20000, restaurant_id=r2.id),
        MenuItem(name="Bánh mì trứng", price=18000, restaurant_id=r2.id),
        MenuItem(name="Bánh mì xíu mại", price=25000, restaurant_id=r2.id),

        MenuItem(name="Phở bò tái", price=50000, restaurant_id=r3.id),
        MenuItem(name="Phở bò viên", price=48000, restaurant_id=r3.id),
        MenuItem(name="Phở gà", price=45000, restaurant_id=r3.id),

        MenuItem(name="Cơm Sườn", price=35000, restaurant_id=r4.id),
        MenuItem(name="Cơm Sườn Chả", price=45000, restaurant_id=r4.id),
        MenuItem(name="Cơm Sườn Bì Chả", price=55000, restaurant_id=r4.id),

        MenuItem(name="Lươn Nướng", price=120000, restaurant_id=r5.id),
        MenuItem(name="Cháo Lươn", price=50000, restaurant_id=r5.id),
        MenuItem(name="Miến Lươn", price=45000, restaurant_id=r5.id),
    ]

    db.session.add_all(menu_items)
    db.session.commit()

    print("Seed data DONE!")
