const API = "https://location-based-food-street-guide.onrender.com/admin/restaurants";
let editingId = null;

/* ======================
   LOAD ACTIVE RESTAURANTS
====================== */
function loadActive() {
  fetch(API, {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("activeList");
      list.innerHTML = "";

      data.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.name}</td>
          <td>${r.avg_eat_time} phút</td>
          <td>
            <button onclick="editRestaurant(${r.id})">✏️ Sửa</button>
            <button onclick="hideRestaurant(${r.id})">🙈 Ẩn</button>
            <button onclick="openMenu(${r.id})">🍽 Menu</button>
          </td>
        `;
        list.appendChild(tr);
      });
    });
}

/* ======================
   LOAD HIDDEN RESTAURANTS
====================== */
function loadHidden() {
  fetch(`${API}/hidden`, {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById("hiddenList");
      list.innerHTML = "";

      data.forEach(r => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.name}</td>
          <td>
            <button onclick="restoreRestaurant(${r.id})">↩️ Khôi phục</button>
            <button onclick="deleteForever(${r.id}, '${r.name}')">🔥 Xoá vĩnh viễn</button>
          </td>
        `;
        list.appendChild(tr);
      });
    });
}

/* ======================
   ADD / UPDATE RESTAURANT
====================== */
function addRestaurant() {
  const data = {
    name: document.getElementById("name").value,
    lat: parseFloat(document.getElementById("lat").value),
    lng: parseFloat(document.getElementById("lng").value),
    avg_eat_time: parseInt(document.getElementById("avg").value),
    description: document.getElementById("desc").value
  };

  const method = editingId ? "PUT" : "POST";
  const url = editingId ? `${API}/${editingId}` : API;

  fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data)
  }).then(() => {
    editingId = null;
    loadActive();
  });
}

/* ======================
   EDIT RESTAURANT
====================== */
function editRestaurant(id) {
  fetch(API, {
    credentials: "include"
  })
    .then(res => res.json())
    .then(data => {
      const r = data.find(x => x.id === id);
      document.getElementById("name").value = r.name;
      document.getElementById("lat").value = r.lat;
      document.getElementById("lng").value = r.lng;
      document.getElementById("avg").value = r.avg_eat_time;
      document.getElementById("desc").value = r.description;
      editingId = id;
    });
}

/* ======================
   HIDE RESTAURANT
====================== */
function hideRestaurant(id) {
  fetch(`${API}/${id}/hide`, {
    method: "PUT",
    credentials: "include"
  }).then(() => {
    loadActive();
    loadHidden();
  });
}

/* ======================
   RESTORE RESTAURANT
====================== */
function restoreRestaurant(id) {
  fetch(`${API}/${id}/restore`, {
    method: "PUT",
    credentials: "include"
  }).then(() => {
    loadActive();
    loadHidden();
  });
}

/* ======================
   DELETE FOREVER
====================== */
function deleteForever(id, name) {
  const confirmName = prompt(`Gõ chính xác tên quán để xoá:\n${name}`);
  if (confirmName !== name) {
    alert("Tên không khớp!");
    return;
  }

  fetch(`${API}/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ confirm_name: confirmName })
  }).then(() => loadHidden());
}

/* ======================
   OPEN MENU PAGE
====================== */
function openMenu(id) {
  window.location.href = `menu.html?restaurant_id=${id}`;
}

/* ======================
   INIT
====================== */
loadActive();
loadHidden();
