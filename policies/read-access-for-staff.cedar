@id("read-access-for-staff")
permit (
  principal is Eve::User,
  action in [Eve::Action::"lookup_order", Eve::Action::"lookup_customer"],
  resource == Eve::Agent::"orderdesk"
)
when {
  principal.hasTag("scope") &&
  (principal.getTag("scope") like "*orders:read*" || principal.getTag("scope") like "*orders:\\**")
};
