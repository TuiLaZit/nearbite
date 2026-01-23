const params = new URLSearchParams(window.location.search);
const restaurantId = params.get("restaurant_id");

const API_MENU = `http://127.0.0.1:5000/admin/restaurants/${restaurantId}/menu`;
let editingItemId = null;

function loadMenu() {
  fetch(API_MENU,{credentials: "include"})
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("menuList");
      list.innerHTML = "";

      data.forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `
          ${item.name} - ${item.price}đ
          <button onclick="editItem(${item.id}, '${item.name}', ${item.price})">✏️</button>
          <button onclick="deleteItem(${item.id})">🗑</button>
        `;
        list.appendChild(li);
      });
    });
}

function saveItem() {
  const data = {
    name: document.getElementById("itemName").value,
    price: parseInt(document.getElementById("itemPrice").value)
  };

  const method = editingItemId ? "PUT" : "POST";
  const url = editingItemId
    ? `http://127.0.0.1:5000/admin/menu/${editingItemId}`
    : API_MENU;

  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include"
  }).then(() => {
    editingItemId = null;
    document.getElementById("itemName").value = "";
    document.getElementById("itemPrice").value = "";
    loadMenu();
  });
}

function editItem(id, name, price) {
  editingItemId = id;
  document.getElementById("itemName").value = name;
  document.getElementById("itemPrice").value = price;
}

function deleteItem(id) {
  if (!confirm("Xoá món này?")) return;

  fetch(`http://127.0.0.1:5000/admin/menu/${id}`, {
    credentials: "include",
    method: "DELETE"
  }).then(loadMenu);
}

function goBack() {
  window.location.href = "admin.html";
}


loadMenu();
