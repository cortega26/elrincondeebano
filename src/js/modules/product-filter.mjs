
// Check if two words differ by exactly one character (insertion/deletion)
function isOneCharacterDifference(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length - shorter.length !== 1) return false;

    let shifts = 0;
    let i = 0,
        j = 0;

    while (i < shorter.length && j < longer.length) {
        if (shorter[i] === longer[j]) {
            i++;
            j++;
        } else {
            shifts++;
            if (shifts > 1) return false; // More than one shift needed
            j++; // Skip the extra character in longer string
        }
    }

    return true;
}

// Very strict typo detection - only catches obvious single-character mistakes
export function isSimpleTypo(query, text) {
    const words = text.split(/\s+/);

    return words.some((word) => {
        if (Math.abs(word.length - query.length) > 1) return false;

        // Count character differences
        let differences = 0;
        const minLen = Math.min(word.length, query.length);

        // Too short to safely compare
        if (minLen < 4) return false;

        // Check for single character insertion/deletion
        if (word.length === query.length) {
            // Same length - check for substitution
            for (let i = 0; i < word.length; i++) {
                if (word[i] !== query[i]) differences++;
                if (differences > 1) return false; // More than 1 difference
            }
            return differences === 1;
        } else {
            // Different length - check for insertion/deletion
            return isOneCharacterDifference(query, word);
        }
    });
}

// MUCH MORE CONSERVATIVE fuzzy matching - only for obvious typos
export function simpleTypoFix(query, text) {
    if (!query || !text || query.length < 3) return false;

    const normalizeText = (str) =>
        str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove accents only
            .trim();

    const normalizedQuery = normalizeText(query);
    const normalizedText = normalizeText(text);

    // First try exact match (same as original)
    if (normalizedText.includes(normalizedQuery)) {
        return true;
    }

    // ONLY try typo correction if query is 4+ characters
    // and the difference is just 1-2 characters
    if (normalizedQuery.length >= 4) {
        // Check if it's a simple 1-character typo
        // Like "choclate" vs "chocolate" or "galetas" vs "galletas"
        return isSimpleTypo(normalizedQuery, normalizedText);
    }

    return false;
}

export const sortProducts = (a, b, criterion) => {
    if (!criterion || criterion === 'original') {
        return a.originalIndex - b.originalIndex;
    }
    const [property, order] = criterion.split('-');
    const valueA = property === 'price' ? a.price - (a.discount || 0) : a.name.toLowerCase();
    const valueB = property === 'price' ? b.price - (b.discount || 0) : b.name.toLowerCase();
    return order === 'asc'
        ? valueA < valueB
            ? -1
            : valueA > valueB
                ? 1
                : 0
        : valueB < valueA
            ? -1
            : valueB > valueA
                ? 1
                : 0;
};

// REPLACE your filterProducts function with this CONSERVATIVE version:
export const filterProducts = (products, keyword, sortCriterion, discountOnly = false) => {
    const trimmedKeyword = keyword.trim();

    return products
        .filter((product) => {
            if (!product.stock) return false;
            if (discountOnly && !(product.discount && Number(product.discount) > 0)) return false;

            // If no keyword, show all (same as original behavior)
            if (!trimmedKeyword) return true;

            // Try EXACT matching first (exactly like original)
            const exactMatch =
                product.name.toLowerCase().includes(trimmedKeyword.toLowerCase()) ||
                product.description.toLowerCase().includes(trimmedKeyword.toLowerCase());

            if (exactMatch) return true;

            // ONLY try typo fix for longer queries and only for name field
            if (trimmedKeyword.length >= 4) {
                return simpleTypoFix(trimmedKeyword, product.name);
            }

            return false;
        })
        .sort((a, b) => sortProducts(a, b, sortCriterion));
};
