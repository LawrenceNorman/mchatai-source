const RANK_VALUE = new Map([
  ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7", 7], ["8", 8],
  ["9", 9], ["10", 10], ["J", 11], ["Q", 12], ["K", 13], ["A", 14]
]);

export class PokerHandEvaluator {
  evaluate(cards) {
    const combos = this.combinations(cards, 5);
    return combos
      .map((combo) => this.evaluateFive(combo))
      .sort((a, b) => this.compare(b, a))[0] ?? null;
  }

  evaluateFive(cards) {
    const ranks = cards.map((card) => RANK_VALUE.get(card.rank)).sort((a, b) => b - a);
    const suits = cards.map((card) => card.suit);
    const flush = suits.every((suit) => suit === suits[0]);
    const straightHigh = this.straightHigh(ranks);
    const counts = this.rankCounts(ranks);
    const groups = [...counts.entries()]
      .map(([rank, count]) => ({ rank, count }))
      .sort((a, b) => b.count - a.count || b.rank - a.rank);

    if (flush && straightHigh) return this.result("straight-flush", 8, [straightHigh], cards);
    if (groups[0].count === 4) return this.result("four-kind", 7, [groups[0].rank, groups[1].rank], cards);
    if (groups[0].count === 3 && groups[1].count === 2) return this.result("full-house", 6, [groups[0].rank, groups[1].rank], cards);
    if (flush) return this.result("flush", 5, ranks, cards);
    if (straightHigh) return this.result("straight", 4, [straightHigh], cards);
    if (groups[0].count === 3) return this.result("three-kind", 3, this.groupRanks(groups), cards);
    if (groups[0].count === 2 && groups[1].count === 2) return this.result("two-pair", 2, this.groupRanks(groups), cards);
    if (groups[0].count === 2) return this.result("pair", 1, this.groupRanks(groups), cards);
    return this.result("high-card", 0, ranks, cards);
  }

  compare(a, b) {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i += 1) {
      const diff = (a.tiebreakers[i] ?? 0) - (b.tiebreakers[i] ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return 0;
  }

  result(name, score, tiebreakers, cards) {
    return { name, score, tiebreakers, cards };
  }

  rankCounts(ranks) {
    const counts = new Map();
    for (const rank of ranks) {
      counts.set(rank, (counts.get(rank) ?? 0) + 1);
    }
    return counts;
  }

  groupRanks(groups) {
    return groups.flatMap((group) => Array.from({ length: group.count }, () => group.rank));
  }

  straightHigh(ranks) {
    const unique = [...new Set(ranks)].sort((a, b) => b - a);
    if (unique.includes(14)) {
      unique.push(1);
    }
    for (let i = 0; i <= unique.length - 5; i += 1) {
      const run = unique.slice(i, i + 5);
      if (run[0] - run[4] === 4) {
        return run[0];
      }
    }
    return null;
  }

  combinations(items, size) {
    const result = [];
    const walk = (start, combo) => {
      if (combo.length === size) {
        result.push(combo.slice());
        return;
      }
      for (let i = start; i < items.length; i += 1) {
        combo.push(items[i]);
        walk(i + 1, combo);
        combo.pop();
      }
    };
    walk(0, []);
    return result;
  }
}
