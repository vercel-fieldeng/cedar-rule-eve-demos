@id("service-reconciler-summary-exports")
permit (
  principal == Eve::ServicePrincipal::"svc-nightly-reconciler",
  action == Eve::Action::"export_customer_data",
  resource == Eve::Agent::"orderdesk"
)
when {
  context.input.format == "summary" &&
  !(context.input has includePii && context.input.includePii == true)
};
