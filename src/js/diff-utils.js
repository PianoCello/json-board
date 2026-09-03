(function exposeJsonBoardDiff(global) {
  'use strict';

  const EXACT_DIFF_CELLS = 160000;
  const LOOKAHEAD_LINES = 120;

  function splitLines(text) {
    return text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n');
  }

  function exactMatches(left, right, leftStart, leftEnd, rightStart, rightEnd) {
    const leftLength = leftEnd - leftStart;
    const rightLength = rightEnd - rightStart;
    const matrix = Array.from({ length: leftLength + 1 }, () => new Uint32Array(rightLength + 1));
    for (let a = leftLength - 1; a >= 0; a -= 1) {
      for (let b = rightLength - 1; b >= 0; b -= 1) {
        matrix[a][b] = left[leftStart + a] === right[rightStart + b]
          ? matrix[a + 1][b + 1] + 1
          : Math.max(matrix[a + 1][b], matrix[a][b + 1]);
      }
    }
    const matches = [];
    let a = 0;
    let b = 0;
    while (a < leftLength && b < rightLength) {
      if (left[leftStart + a] === right[rightStart + b]) {
        matches.push([leftStart + a, rightStart + b]);
        a += 1;
        b += 1;
      } else if (matrix[a + 1][b] >= matrix[a][b + 1]) a += 1;
      else b += 1;
    }
    return matches;
  }

  function uniqueAnchors(left, right, leftStart, leftEnd, rightStart, rightEnd) {
    const leftCounts = new Map();
    const rightCounts = new Map();
    const rightPositions = new Map();
    for (let index = leftStart; index < leftEnd; index += 1) {
      leftCounts.set(left[index], (leftCounts.get(left[index]) || 0) + 1);
    }
    for (let index = rightStart; index < rightEnd; index += 1) {
      rightCounts.set(right[index], (rightCounts.get(right[index]) || 0) + 1);
      rightPositions.set(right[index], index);
    }
    const candidates = [];
    for (let index = leftStart; index < leftEnd; index += 1) {
      const value = left[index];
      if (value !== '' && leftCounts.get(value) === 1 && rightCounts.get(value) === 1) {
        candidates.push([index, rightPositions.get(value)]);
      }
    }
    if (candidates.length < 2) return candidates;

    const tails = [];
    const tailCandidateIndexes = [];
    const previous = new Int32Array(candidates.length).fill(-1);
    for (let index = 0; index < candidates.length; index += 1) {
      const rightIndex = candidates[index][1];
      let low = 0;
      let high = tails.length;
      while (low < high) {
        const middle = (low + high) >> 1;
        if (tails[middle] < rightIndex) low = middle + 1;
        else high = middle;
      }
      tails[low] = rightIndex;
      previous[index] = low > 0 ? tailCandidateIndexes[low - 1] : -1;
      tailCandidateIndexes[low] = index;
    }
    const anchors = [];
    let cursor = tailCandidateIndexes[tails.length - 1];
    while (cursor >= 0) {
      anchors.push(candidates[cursor]);
      cursor = previous[cursor];
    }
    return anchors.reverse();
  }

  function nearbyMatches(left, right, leftStart, leftEnd, rightStart, rightEnd) {
    const matches = [];
    let a = leftStart;
    let b = rightStart;
    while (a < leftEnd && b < rightEnd) {
      if (left[a] === right[b]) {
        matches.push([a, b]);
        a += 1;
        b += 1;
        continue;
      }
      let found = null;
      const maxDistance = Math.min(
        LOOKAHEAD_LINES * 2,
        (leftEnd - a - 1) + (rightEnd - b - 1)
      );
      for (let distance = 1; distance <= maxDistance && !found; distance += 1) {
        const minLeftStep = Math.max(0, distance - LOOKAHEAD_LINES);
        const maxLeftStep = Math.min(LOOKAHEAD_LINES, distance);
        for (let leftStep = minLeftStep; leftStep <= maxLeftStep; leftStep += 1) {
          const rightStep = distance - leftStep;
          if (a + leftStep >= leftEnd || b + rightStep >= rightEnd) continue;
          if (left[a + leftStep] === right[b + rightStep]) {
            found = [a + leftStep, b + rightStep];
            break;
          }
        }
      }
      if (!found) break;
      matches.push(found);
      a = found[0] + 1;
      b = found[1] + 1;
    }
    return matches;
  }

  function collectMatches(left, right, leftStart, leftEnd, rightStart, rightEnd, matches) {
    while (leftStart < leftEnd && rightStart < rightEnd && left[leftStart] === right[rightStart]) {
      matches.push([leftStart, rightStart]);
      leftStart += 1;
      rightStart += 1;
    }

    const suffix = [];
    while (leftStart < leftEnd && rightStart < rightEnd && left[leftEnd - 1] === right[rightEnd - 1]) {
      leftEnd -= 1;
      rightEnd -= 1;
      suffix.push([leftEnd, rightEnd]);
    }

    if (leftStart < leftEnd && rightStart < rightEnd) {
      const leftLength = leftEnd - leftStart;
      const rightLength = rightEnd - rightStart;
      if (leftLength * rightLength <= EXACT_DIFF_CELLS) {
        matches.push(...exactMatches(left, right, leftStart, leftEnd, rightStart, rightEnd));
      } else {
        const anchors = uniqueAnchors(left, right, leftStart, leftEnd, rightStart, rightEnd);
        if (anchors.length) {
          let previousLeft = leftStart;
          let previousRight = rightStart;
          for (const [anchorLeft, anchorRight] of anchors) {
            collectMatches(left, right, previousLeft, anchorLeft, previousRight, anchorRight, matches);
            matches.push([anchorLeft, anchorRight]);
            previousLeft = anchorLeft + 1;
            previousRight = anchorRight + 1;
          }
          collectMatches(left, right, previousLeft, leftEnd, previousRight, rightEnd, matches);
        } else {
          matches.push(...nearbyMatches(left, right, leftStart, leftEnd, rightStart, rightEnd));
        }
      }
    }
    matches.push(...suffix.reverse());
  }

  function lineDiff(leftText, rightText) {
    const leftLines = splitLines(leftText);
    const rightLines = splitLines(rightText);
    const normalizedLeft = leftLines.map(line => line.trim());
    const normalizedRight = rightLines.map(line => line.trim());
    const matches = [];
    collectMatches(
      normalizedLeft,
      normalizedRight,
      0,
      normalizedLeft.length,
      0,
      normalizedRight.length,
      matches
    );
    matches.sort((first, second) => first[0] - second[0] || first[1] - second[1]);

    const leftStatus = Array(leftLines.length).fill('removed');
    const rightStatus = Array(rightLines.length).fill('added');
    const changes = [];
    let previousLeft = 0;
    let previousRight = 0;
    [...matches, [leftLines.length, rightLines.length]].forEach(([matchLeft, matchRight], matchIndex) => {
      if (matchLeft > previousLeft || matchRight > previousRight) {
        changes.push({
          leftStart: matchLeft > previousLeft ? previousLeft : null,
          leftEnd: matchLeft - 1,
          rightStart: matchRight > previousRight ? previousRight : null,
          rightEnd: matchRight - 1,
          leftAnchor: leftLines.length ? Math.min(previousLeft, leftLines.length - 1) : null,
          rightAnchor: rightLines.length ? Math.min(previousRight, rightLines.length - 1) : null
        });
      }
      const paired = Math.min(matchLeft - previousLeft, matchRight - previousRight);
      for (let offset = 0; offset < paired; offset += 1) {
        leftStatus[previousLeft + offset] = 'modified';
        rightStatus[previousRight + offset] = 'modified';
      }
      if (matchIndex < matches.length) {
        leftStatus[matchLeft] = 'same';
        rightStatus[matchRight] = 'same';
        previousLeft = matchLeft + 1;
        previousRight = matchRight + 1;
      }
    });
    return { leftLines, rightLines, leftStatus, rightStatus, changes };
  }

  global.JsonBoardDiff = { lineDiff };
})(typeof window === 'undefined' ? globalThis : window);
