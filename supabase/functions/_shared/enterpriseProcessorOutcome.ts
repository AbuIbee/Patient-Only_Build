export function enterpriseProcessorReady(input: {
  component: string; subscriptionStatus: string; savedPaymentMethod: boolean;
  invoicePaid: boolean; checkoutPaymentStatus?: string;
}): boolean {
  if (!['active','trialing'].includes(input.subscriptionStatus)) return false;
  if (input.checkoutPaymentStatus && !['paid','no_payment_required'].includes(input.checkoutPaymentStatus)) return false;
  if (input.component === 'monthly_patients') {
    return input.savedPaymentMethod && (input.subscriptionStatus === 'trialing' || input.invoicePaid);
  }
  return input.component === 'annual_license' && input.subscriptionStatus === 'active' && input.invoicePaid;
}
