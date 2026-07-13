const DEFAULT_FUZZY_THRESHOLD = 0.72;
const TICKETED_SESSION_SUFFIX = /\s*\(\s*(early|late)\s+show\s*\)\s*$/i;

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(
      /\b(the|and|with|special|guests?|guest|support|supports?|from|live|at|present|presents|tour|perth|wa|australian|australia|2026)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedTitleKey(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1)
    .join(" ");
}

function tokenSet(value) {
  return new Set(normalizedTitleKey(value).split(" ").filter(Boolean));
}

function jaccard(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function getTicketedSession(title) {
  const normalizedTitle = String(title ?? "").trim();
  const match = normalizedTitle.match(TICKETED_SESSION_SUFFIX);

  if (!match?.[1] || match.index === undefined) {
    return null;
  }

  const baseTitle = normalizedTitleKey(normalizedTitle.slice(0, match.index));

  return baseTitle
    ? {
        baseTitle,
        session: match[1].toLowerCase()
      }
    : null;
}

function normalizeTicketIdentity(value) {
  const ticketUrl = String(value ?? "").trim();

  if (!ticketUrl) {
    return null;
  }

  try {
    const parsed = new URL(ticketUrl);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return ticketUrl;
  }
}

function getStartTimestamp(value) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isDistinctTicketedSessionPair(left, right) {
  const leftSession = getTicketedSession(left.title);
  const rightSession = getTicketedSession(right.title);

  if (
    !leftSession ||
    !rightSession ||
    leftSession.session === rightSession.session ||
    leftSession.baseTitle !== rightSession.baseTitle
  ) {
    return false;
  }

  const leftStartsAt = getStartTimestamp(left.starts_at);
  const rightStartsAt = getStartTimestamp(right.starts_at);

  if (
    leftStartsAt === null ||
    rightStartsAt === null ||
    leftStartsAt === rightStartsAt
  ) {
    return false;
  }

  const leftTicket = normalizeTicketIdentity(left.ticket_url);
  const rightTicket = normalizeTicketIdentity(right.ticket_url);

  return Boolean(leftTicket && rightTicket && leftTicket !== rightTicket);
}

export function classifyFuzzyDuplicatePair(
  left,
  right,
  threshold = DEFAULT_FUZZY_THRESHOLD
) {
  if (isDistinctTicketedSessionPair(left, right)) {
    return null;
  }

  const score = jaccard(left.title, right.title);
  const leftTitle = normalizedTitleKey(left.title);
  const rightTitle = normalizedTitleKey(right.title);
  const contains = Boolean(
    leftTitle &&
      rightTitle &&
      (leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))
  );

  return score >= threshold || contains ? { score } : null;
}
