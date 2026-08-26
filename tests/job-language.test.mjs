import { pass, fail } from './helpers.mjs';
import { artifactLanguageInstruction, resolveJobLanguage } from '../job-language.mjs';

console.log('\njob language — per-job resolver');

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

const german = resolveJobLanguage({
  jdText: 'Wir suchen eine erfahrene Person für unser Team. Sie übernehmen anspruchsvolle Aufgaben und bringen Erfahrung mit moderner Software, Kunden und Zusammenarbeit mit.',
});
check(german.language === 'de' && german.source === 'jd-text' && german.confidence >= 0.8, 'German JD resolves from JD body');

const english = resolveJobLanguage({
  jdText: 'You will join our engineering team and work with product partners. The role requires experience with reliable systems, customer outcomes, and clear communication for your team.',
});
check(english.language === 'en' && english.source === 'jd-text' && english.confidence >= 0.75, 'English JD resolves from JD body');

const extracted = resolveJobLanguage({
  extractedText: 'Nous recherchons une personne expérimentée pour rejoindre notre équipe. Vous travaillerez avec le produit et les clients, avec une grande autonomie et une excellente communication.',
});
check(extracted.language === 'fr' && extracted.source === 'extracted-posting-content', 'extracted posting content is used only after an absent JD body');

const mixed = resolveJobLanguage({
  jdText: 'Wir suchen eine engineer for our team. Sie arbeiten with product and customers, und you will build reliable software for our company.',
});
check(mixed.source === 'jd-text' && mixed.confidence < 0.9 && mixed.warning, 'mixed-language JD exposes reduced confidence instead of a silent certainty');

const short = resolveJobLanguage({ jdText: 'Senior Engineer' });
check(short.source === 'fallback' && short.confidence === 0 && short.warning, 'short JD returns an explicit low-confidence fallback');

const override = resolveJobLanguage({ jdText: 'English body', jobLanguageOverride: 'de' });
check(override.language === 'de' && override.confidence === 1 && override.source === 'explicit-override', 'manual job override wins only for that job');
check(artifactLanguageInstruction('de').includes('in de') && artifactLanguageInstruction('de').includes('analysis language'), 'artifact instruction explicitly isolates JD language from analysis language');
