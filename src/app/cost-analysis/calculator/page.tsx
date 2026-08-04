import { redirect } from 'next/navigation';

// The calculator now lives inline on the main Cost Analysis page. Keep this
// route as a redirect so any saved link still lands in the right place.
export default function PricingCalculatorRedirect() {
  redirect('/cost-analysis');
}
