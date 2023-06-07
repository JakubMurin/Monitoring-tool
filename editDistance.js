function levenshteinDistance(initial, compared, delta) {
    const array = [];
    for (let i=0; i <= compared.length; i++) {
        array[i] = [i];
        for (let j=1; j <= initial.length; j++) {
            if (i == 0) {
                array[i][j] = j;
            }
            else {
                const diff = (computeDelta(initial[j - 1], compared[i - 1], delta)) ? 0 : 1;
                array[i][j] = Math.min(
                    array[i - 1][j] + 1,        // insertion
                    array[i][j - 1] + 1,        // deletion
                    array[i - 1][j - 1] + diff  // substitution
                );
            }
            
        }
    }
    return array[compared.length][initial.length];
}

function computeDelta(a, b, delta) {
    return Math.abs(a - b) < a / 100 * delta;
}

function hammingDistance(initial, compared, delta) {
    let distance = 0;
    for (let i=0; i<initial.length; i++) {
        if (computeDelta(initial[i], compared[i], delta)) {
            distance++;
        }
    }
    return distance;
}

module.exports = { levenshteinDistance, hammingDistance };
