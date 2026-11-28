// Digital Asset Links: tells Android that the "GetOnDeal CRM" app (package below, signed with the key whose PUBLIC fingerprint is listed)
// is allowed to open this website full screen, without a browser address bar. The fingerprint is public information, not a secret.
// If the signing key is ever replaced, add the new fingerprint here (keep the old one until the old app is retired).
export async function GET() {
  return Response.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.getondeal.crm",
        sha256_cert_fingerprints: ["49:C3:0A:E5:B0:31:5B:AD:A5:62:65:87:22:E6:60:DB:A8:51:98:C5:CE:09:F8:3F:7C:EA:0B:97:D9:D0:E8:1E"],
      },
    },
  ]);
}
