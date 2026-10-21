const maleIndicators = /\b(male|man|masculine|alex|andrew|aaron|brian|christopher|daniel|david|eric|fred|guy|james|john|mark|matthew|michael|ryan|thomas|tom)\b/i;
const femaleIndicators = /\b(female|woman|feminine|aria|ava|hazel|jenny|karen|moira|samantha|serena|susan|tessa|victoria|zira)\b/i;
const qualityIndicators = /natural|neural|premium|enhanced|online|google|microsoft/i;

export function normalizeSpeechText(text) {
  return text.replace(/\bvs\b\.?/gi, 'versus');
}

function rankEnglishVoice(voice) {
  const name = voice.name ?? '';
  const male = maleIndicators.test(name);
  const female = femaleIndicators.test(name);
  return (male ? 100 : 0) +
    (qualityIndicators.test(name) ? 20 : 0) +
    (!female ? 5 : -30) +
    (voice.lang?.toLocaleLowerCase() === 'en-us' ? 3 : 0) +
    (voice.default ? -2 : 0) +
    (!voice.localService ? 1 : 0);
}

export function selectEnglishVoice(voices) {
  const englishVoices = voices.filter((voice) => voice.lang?.toLocaleLowerCase().startsWith('en'));
  if (englishVoices.length > 0) {
    const maleEnglishVoices = englishVoices.filter((voice) => maleIndicators.test(voice.name ?? ''));
    const candidates = maleEnglishVoices.length > 0 ? maleEnglishVoices : englishVoices;
    return candidates
      .slice()
      .sort((first, second) => rankEnglishVoice(second) - rankEnglishVoice(first))[0];
  }

  return voices.find((voice) => voice.default) ?? null;
}
