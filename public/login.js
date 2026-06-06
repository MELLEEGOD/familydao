const childSelect = document.getElementById("childSelect");
const parentPassword = document.getElementById("parentPassword");
const childPassword = document.getElementById("childPassword");
const parentLogin = document.getElementById("parentLogin");
const childLogin = document.getElementById("childLogin");
const loginMessage = document.getElementById("loginMessage");
let parentUserId = "";

function friendlyLoginError(message) {
  return message || "Please check the login details.";
}

function showLoginError(message) {
  loginMessage.textContent = friendlyLoginError(message);
  loginMessage.className = "login-toast rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-800";
}

function clearLoginError() {
  loginMessage.classList.add("hidden");
  [parentPassword, childPassword].forEach((field) => field.removeAttribute("aria-invalid"));
}

function requirePassword(field, label) {
  if (field.value.trim()) return true;
  field.setAttribute("aria-invalid", "true");
  field.focus();
  showLoginError(`${label} password is needed.`);
  return false;
}

async function loadLogin() {
  const response = await fetch("/api/state");
  const state = await response.json();
  const parent = state.users.find((user) => user.role === "ADMIN");
  const children = state.users.filter((user) => user.role === "USER");

  if (parent) {
    parentUserId = parent.id;
  }

  childSelect.replaceChildren(...children.map((user) => new Option(user.name, user.id)));
  const savedChild = localStorage.getItem("family-dao-child-user");
  if (savedChild && children.some((user) => user.id === savedChild)) {
    childSelect.value = savedChild;
  }
  FamilyDAOSelects.enhance({ wrapperClass: "mt-2" });
}

async function login({ role, userId, password }) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, userId, password })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Login failed.");
  }

  const mode = role === "ADMIN" ? "parent" : "child";
  localStorage.setItem(`family-dao-${mode}-user`, payload.user.id);
  localStorage.setItem(`family-dao-${mode}-token`, payload.authToken);
  window.location.href = role === "ADMIN" ? "/parent" : "/child";
}

parentLogin.addEventListener("click", () => {
  if (!requirePassword(parentPassword, "Parent")) return;
  login({ role: "ADMIN", userId: parentUserId, password: parentPassword.value }).catch((error) =>
    showLoginError(error.message)
  );
});

childLogin.addEventListener("click", () => {
  if (!requirePassword(childPassword, "Child")) return;
  login({ role: "USER", userId: childSelect.value, password: childPassword.value }).catch((error) =>
    showLoginError(error.message)
  );
});

[parentPassword, childPassword].forEach((field) => field.addEventListener("input", clearLoginError));

loadLogin();
