/** Maps Supabase Auth sign-in errors to user-visible messages with fix hints. */
export function formatSignInError(err: {
  message: string;
  status?: number;
  code?: string;
}): string {
  const code = err.code ? ` [${err.code}]` : "";
  const base = `${err.message}${code}`;
  const msg = err.message.toLowerCase();
  if (
    msg.includes("invalid login credentials") ||
    err.code === "invalid_credentials"
  ) {
    return `${base} — If these are demo accounts, run \`npm run seed:demo-users\` (with \`SUPABASE_SERVICE_ROLE_KEY\` in \`.env.local\`), then try again. Also confirm the user exists in Supabase → Authentication → Users.`;
  }
  if (msg.includes("email not confirmed")) {
    return `${base} — Re-run \`npm run seed:demo-users\` (sets email as confirmed) or confirm the user in the Supabase dashboard.`;
  }
  if (msg.includes("captcha")) {
    return `${base} — In Supabase → Authentication → Bot protection, disable CAPTCHA for development or pass a captcha token from the client.`;
  }
  return base;
}
