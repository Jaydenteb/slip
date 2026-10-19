function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}

export const env = {
  paypalClientId: () => required("PAYPAL_CLIENT_ID"),
  paypalClientSecret: () => required("PAYPAL_CLIENT_SECRET"),
  paypalWebhookId: () => required("PAYPAL_WEBHOOK_ID"),
  // Sandbox unless explicitly told otherwise; this project never needs live money.
  paypalSandbox: () => process.env.PAYPAL_ENVIRONMENT !== "PRODUCTION",
  paypalBaseUrl: () =>
    process.env.PAYPAL_ENVIRONMENT === "PRODUCTION"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com",
};
