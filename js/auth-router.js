import { getSupabase, isSupabaseConfigured } from "./supabase.js";

export const roleRoutes = {
  admin: "admin-dashboard.html",
  vendor: "vendor-dashboard.html",
  customer: "customer-dashboard.html"
};

export async function getAuthenticatedProfile() {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const client = await getSupabase();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return { client, user: null, profile: null };

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) return { client, user: null, profile: null };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,role")
    .eq("id", user.id)
    .single();
  if (profileError) {
    const error = new Error("Your account profile could not be found. Please contact support.");
    error.code = profileError.code;
    throw error;
  }
  if (!Object.hasOwn(roleRoutes, profile.role)) {
    throw new Error("Invalid account role.");
  }
  return { client, user, profile };
}

export function dashboardUrl(role) {
  const page = roleRoutes[role];
  if (!page) throw new Error("Invalid account role.");
  return new URL(page, window.location.href).href;
}

export async function redirectToRole(role) {
  window.location.replace(dashboardUrl(role));
}

export async function signOutAndRedirect(message = "") {
  try {
    const client = await getSupabase();
    await client.auth.signOut();
  } finally {
    const target = new URL("login.html", window.location.href);
    if (message) target.searchParams.set("error", message);
    window.location.replace(target.href);
  }
}
