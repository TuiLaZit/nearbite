from db import db

class Restaurant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text)
    avg_eat_time = db.Column(db.Integer)
    is_active = db.Column(db.Boolean, default=True)

    menu_items = db.relationship(
        "MenuItem",
        backref="restaurant",
        cascade="all, delete-orphan",
        lazy=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "lat": self.lat,
            "lng": self.lng,
            "description": self.description,
            "avg_eat_time": self.avg_eat_time,
            "menu": [item.to_dict() for item in self.menu_items],
            "is_active": self.is_active
        }


class MenuItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    price = db.Column(db.Integer, nullable=False)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurant.id"))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "price": self.price
        }
