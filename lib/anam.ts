// ─────────────────────────────────────────────────
//  Anam — live-avatar map for AI Journalist personas
// ─────────────────────────────────────────────────
// Avatar IDs are public identifiers, not secrets.
// The Anam API key is server-side only (ANAM_API_KEY, never
// NEXT_PUBLIC_*) and is used only by pages/api/anam/session.ts.
//
// Marcus Cole, Hank Vance, and Victoria Hayes match the Anam avatars
// already used by the Don/Marcus/Hank stage:
//   Marcus Cole  126ea560-804d-4178-85b1-f625efa46133
//   Hank Vance   b8afa63b-5552-498f-8bfc-764bb01ceec3
//   Victoria Hayes  fa76ec82-30eb-42ea-9279-bf062359d005
//     (created Nov 27, 2026 from the reference photo Matthew sent:
//      blonde, blue suit, WTP News mic —
//      ~/workspace/don-avatar/anam-cartesia/avatar-frames/victoria-anam-1152-v2.png,
//      reframed with headroom; the first Victoria avatar
//      262d8396-0437-4b09-8399-7ee7dc582922 is SUPERSEDED — it cut her head off)

export interface AnamPersona {
  name: string;
  avatarId: string;
}

export const ANAM_AVATARS: Record<string, AnamPersona> = {
  "marcus-cole": {
    name: "Marcus Cole",
    avatarId: "126ea560-804d-4178-85b1-f625efa46133",
  },
  "hank-vance": {
    name: "Hank Vance",
    avatarId: "b8afa63b-5552-498f-8bfc-764bb01ceec3",
  },
  "victoria-hayes": {
    name: "Victoria Hayes",
    avatarId: "fa76ec82-30eb-42ea-9279-bf062359d005",
  },
};

export function getAnamAvatar(journalistId: string): AnamPersona | null {
  return ANAM_AVATARS[journalistId] ?? null;
}

export function hasAnamAvatar(journalistId: string): boolean {
  return journalistId in ANAM_AVATARS;
}
