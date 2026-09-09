@id("service-reconciler-readonly")
permit (
  principal == Eve::ServicePrincipal::"svc-nightly-reconciler",
  action in [Eve::Action::"lookup_order", Eve::Action::"lookup_customer"],
  resource == Eve::Agent::"orderdesk"
);
