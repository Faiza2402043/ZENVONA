import { getAuthenticatedProfile, dashboardUrl, signOutAndRedirect } from "./auth-router.js";

const script = document.querySelector("script[data-required-role]");
const requiredRole = script?.dataset.requiredRole;

async function protectDashboard() {
  try {
    const { profile } = await getAuthenticatedProfile();
    if (!profile) {
      await signOutAndRedirect("Please sign in to continue.");
      return;
    }
    if (profile.role !== requiredRole) {
      window.location.replace(dashboardUrl(profile.role));
      return;
    }
    window.location.replace(`index.html#${requiredRole}-dashboard`);
  } catch (error) {
    await signOutAndRedirect(error.message || "Your account could not be verified.");
  }
}

void protectDashboard();
