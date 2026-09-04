import { isSubmitLabel, isNotSubmit } from '../src/lib/autopilot/adapters/browser';
const seen = ['Skip to main content','Back','Open Menu','Get Started','Products','Earn','Company','News & Insights','United States (English)','Locations','Teams'];
const accepted = seen.filter((l) => isSubmitLabel(l) && !isNotSubmit(l));
process.stdout.write(`controls on that page: ${seen.length}\naccepted as submit: ${accepted.length === 0 ? 'none' : accepted.join(', ')}\n`);
process.exit(0);
