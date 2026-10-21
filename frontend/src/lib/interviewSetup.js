export function validateTechnologyName(value) {
  if (typeof value !== 'string') {
    return { value: '', error: 'Enter a technology to continue.' };
  }

  const trimmedTechnology = value.trim();
  if ([...trimmedTechnology].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  })) {
    return {
      value: '',
      error: 'Enter a technology using letters, numbers, and supported name separators.',
    };
  }
  const technology = trimmedTechnology.replace(/\s+/gu, ' ');
  if (!technology) {
    return { value: '', error: 'Enter a technology or choose a popular option.' };
  }
  if (
    technology.length > 80 ||
    !/^(?:[\p{L}\p{N}]|\.)(?:[\p{L}\p{N} .+#/&-]*)$/u.test(technology) ||
    !/[\p{L}\p{N}]/u.test(technology)
  ) {
    return {
      value: '',
      error: 'Use up to 80 letters, numbers, spaces, or . # + / & - characters.',
    };
  }

  return { value: technology, error: '' };
}

export function resolveTechnologySelection({
  popularTechnology,
  customTechnology,
  technologies,
}) {
  if (typeof customTechnology === 'string' && customTechnology.trim()) {
    const custom = validateTechnologyName(customTechnology);
    if (custom.error) return custom;
    const existing = technologies.find(
      (technology) => technology.toLocaleLowerCase() === custom.value.toLocaleLowerCase(),
    );
    return { value: existing ?? custom.value, error: '' };
  }

  const popular = technologies.find((technology) => technology === popularTechnology);
  return popular
    ? { value: popular, error: '' }
    : { value: '', error: 'Choose a popular technology or enter another technology.' };
}
