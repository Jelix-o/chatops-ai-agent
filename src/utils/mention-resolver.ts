import type { NapcatGroupMember } from "../types.js";

export function resolveMentionTargetsFromMembers(
  members: NapcatGroupMember[],
  candidates: string[],
): string[] {
  if (members.length === 0 || candidates.length === 0) {
    return [];
  }

  const resolved = new Set<string>();

  for (const rawCandidate of candidates) {
    const candidate = normalizeCandidate(rawCandidate);
    if (!candidate) {
      continue;
    }

    const exactById = members.find((member) => String(member.user_id) === candidate);
    if (exactById) {
      resolved.add(String(exactById.user_id));
      continue;
    }

    const normalizedCandidate = normalizeForMatch(candidate);
    if (!normalizedCandidate) {
      continue;
    }

    const exactMatches = members.filter((member) =>
      getMemberNames(member).some((name) => normalizeForMatch(name) === normalizedCandidate),
    );
    if (exactMatches.length === 1) {
      resolved.add(String(exactMatches[0]!.user_id));
      continue;
    }

    const fuzzyMatches = members.filter((member) =>
      getMemberNames(member).some((name) => {
        const normalizedName = normalizeForMatch(name);
        return (
          normalizedName.length > 0 &&
          (normalizedName.includes(normalizedCandidate) ||
            normalizedCandidate.includes(normalizedName))
        );
      }),
    );
    if (fuzzyMatches.length === 1) {
      resolved.add(String(fuzzyMatches[0]!.user_id));
    }
  }

  return [...resolved];
}

function normalizeCandidate(candidate: string): string {
  return candidate.replace(/^@+/, "").trim();
}

function getMemberNames(member: NapcatGroupMember): string[] {
  return [member.card ?? "", member.nickname ?? ""].filter(Boolean);
}

function normalizeForMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[\s@,:;，。！？、【】\[\]()（）<>《》"'`]+|[\s@,:;，。！？、【】\[\]()（）<>《》"'`]+$/g, "")
    .replace(/\s+/g, "");
}
