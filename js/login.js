import { getAuthenticatedProfile, redirectToRole, signOutAndRedirect } from "./auth-router.js";

const form = document.querySelector("#login-form");
const feedback = document.querySelector("#login-feedback");
const status = document.querySelector("#login-status");
const params = new URLSearchParams(window.location.search);
const roleLabels = { customer: "Customer", vendor: "Vendor", admin: "Admin" };
const requestedRole = Object.hasOwn(roleLabels, params.get("role")) ? params.get("role") : "";

if (requestedRole) {
  const roleName = roleLabels[requestedRole];
  document.querySelectorAll("[data-role-target]").forEach(link => link.classList.toggle("is-selected", link.dataset.roleTarget === requestedRole));
  document.querySelector("#login-heading").textContent = `${roleName} sign in`;
  document.querySelector("#login-description").textContent = `Sign in with your approved ${roleName.toLowerCase()} account. Access is verified from your account role.`;
  document.querySelector("#login-submit").textContent = `SIGN IN AS ${roleName.toUpperCase()}`;
}

function showError(message) {
  feedback.textContent = message;
  status.textContent = "";
}

async function checkExistingSession() {
  try {
    const { profile } = await getAuthenticatedProfile();
    if (profile) {
      status.textContent = "Session found. Opening your dashboard...";
      await redirectToRole(profile.role);
      return;
    }
    status.textContent = "";
  } catch (error) {
    status.textContent = "";
    if (error.message === "Invalid account role.") await signOutAndRedirect(error.message);
  }
  if (params.get("error")) showError(params.get("error"));
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  feedback.textContent = "";
  status.textContent = "Signing you in...";
  try {
    const client = (await getAuthenticatedProfile()).client;
    const values = new FormData(form);
    const { error } = await client.auth.signInWithPassword({
      email: String(values.get("email")).trim(),
      password: String(values.get("password"))
    });
    if (error) throw error;
    const { profile } = await getAuthenticatedProfile();
    if (!profile) throw new Error("Your account profile could not be found. Please contact support.");
    if (requestedRole && profile.role !== requestedRole) {
      await client.auth.signOut();
      const roleError = new Error(`This is a ${roleLabels[profile.role] ?? "different"} account. Choose the matching sign-in option.`);
      roleError.code = "ROLE_MISMATCH";
      throw roleError;
    }
    await redirectToRole(profile.role);
  } catch (error) {
    if (error.code === "ROLE_MISMATCH") {
      showError(error.message);
      button.disabled = false;
      return;
    }
    const message = error.message === "Invalid account role." || error.message.includes("profile could not be found")
      ? error.message
      : "The email or password was not recognized. Please try again.";
    if (message.includes("profile") || message.includes("Invalid account role")) {
      await signOutAndRedirect(message);
      return;
    }
    showError(message);
    button.disabled = false;
  }
});

void checkExistingSession();
