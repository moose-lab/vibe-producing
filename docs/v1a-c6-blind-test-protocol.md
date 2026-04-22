# V1α C6 Blind-Test Protocol (R003 Musicality UAT)

## Purpose

This doc describes the C6 blind-test UAT for **R003** ("The first playback after generation must sound like a musically complete 30-second arrangement, not a loop toy or ambient fragment"). It tests musicality of the first-listen experience under real Claude, with 5 non-musician subjects, using `vibe-origin.html` loaded via `file://` in Chrome. It does NOT test the edit path, latency, or visual polish — those are covered by C1–C5 automated tests. A pass here flips **R003** from `unmapped` to `validated-partial`. Execution happens outside auto-mode; this document is the reproducible facilitator script.

## Pass Bar

- **Primary pass condition:** 4/5 subjects spontaneously describe the output as "a complete song" (or equivalent: "finished track", "full song", "real song") in the free-form reaction, WITHOUT being prompted with a leading question. If the structured question has to prompt them, that counts as a fail for that subject.
- **Hard fail triggers:** 0 or 1 of 5 describe it as complete → escalate per §Failure Escalation.
- **Soft pass (2–3/5):** record but do not close R003 — schedule a follow-up round after prompt-template work.
- The pass bar is a sensory judgment bar, not a statistical one. Five subjects is enough signal for directional confidence at V1α scale; it is not enough for statistical significance and is not claimed to be.

## Recruit Criteria

- 5 adults, 18+.
- Self-identified **non-musician**: no formal musical training, no DAW use in the last 2 years, no active instrument practice.
- Mixed genre familiarity (not all pop listeners, not all classical listeners, not all hip-hop listeners).
- English or Mandarin speaker — the UI loads in either language depending on browser locale; note language in the capture sheet.
- No prior exposure to this project or related AI-music demos — word-of-mouth or public promo seeing counts as exposure. A naive listener is the whole point.
- Compensation: facilitator's discretion; note in the capture sheet if offered.

## Environment

- Hardware: laptop with functioning microphone (built-in is OK if the room is quiet).
- Browser: Chrome (latest stable at test time). Firefox / Safari NOT tested for V1α — stick to Chrome.
- Audio output: wired headphones or bluetooth headphones. NOT laptop speakers (too much room noise, and crosstalk from facilitator's voice on playback).
- Network: online (real Claude API requires it).
- File: `vibe-origin.html` loaded via `file://` protocol — NOT served via localhost. The V1α build is a single-file static.
- API key: real Claude API key set via the modal on first generation. Key is the facilitator's, not the subject's.
- Room: quiet, no other music playing, no ambient TV. One subject at a time, no onlookers.

## Pre-flight (before the first subject)

1. Facilitator loads the page, grants mic permission, confirms the mic input produces a waveform in the UI when humming.
2. Facilitator submits one practice hum to confirm the full pipeline works end-to-end: humming → denoise → DNA extraction → generation → reveal animation → playback. If this fails, investigate and resolve before running any subjects. A broken pipeline invalidates the test.
3. Facilitator clears localStorage between subjects (or uses a fresh Chrome profile per subject) to avoid session bleed between runs.
4. Facilitator has the capture sheet ready (see §Data Capture) and a timer.
5. Facilitator reviews this protocol once through before the first session. The facilitator is the human gate — a sloppy run-through produces sloppy data, and the protocol is the only line of defense against leading the witness.

## Protocol (per subject)

1. **Onboarding (1 min).** Explain: "I'm going to ask you to hum a short melody 3 times. Each time, the computer will turn your hum into a 30-second song. You'll listen to each song once, then tell me what you think." Do not describe the technology, do not mention Claude, do not show the generated Strudel code.
2. **Hum 1.** Subject hums any melody, 5–10 seconds long. Facilitator clicks Generate; subject listens to the 30s loop in full (one pass only, not looped).
3. **Free-form reaction (captured verbatim).** Facilitator asks: "What did you think of that?" Captures the verbatim response. No leading questions, no suggestions, no "did it sound finished?" — that prompt poisons the signal.
4. **Structured question (captured verbatim).** Facilitator asks: "Does this sound more like a complete song, or more like a loop or fragment? Why?" Captures response.
5. **Repeat for Hum 2 and Hum 3.** Same protocol, fresh hums (different melodies if the subject wishes; the same hum twice is also fine).
6. **Exit (30 sec).** Facilitator thanks subject, ends session. Does NOT play back their results or offer interpretation — protecting the next subject's blindness starts here.

Total per subject: ~10 minutes. Total session time: ~60 minutes across 5 subjects plus setup.

## Data Capture

One markdown table with these columns, one row per hum (3 per subject × 5 subjects = 15 rows):

| subject_id | hum_n | language | hum_description | free_reaction | structured_verdict | notes |
|------------|-------|----------|-----------------|---------------|--------------------|-------|

Field definitions:

- `subject_id`: S1 through S5.
- `hum_n`: 1, 2, or 3.
- `language`: `en` or `zh`.
- `hum_description`: facilitator's 5–10 word description (e.g. "descending minor fragment", "bouncy major pattern").
- `free_reaction`: verbatim subject response to "what did you think?".
- `structured_verdict`: verbatim subject response to the "complete song vs loop/fragment" question. Facilitator also codes one of: `complete`, `loop`, `fragment`, `mixed`, `unclear`.
- `notes`: mic issues, network hiccups, anything off-script.

The capture sheet is the primary artifact of this UAT. It travels with the slice summary and becomes the research input for any follow-up musicality work.

## Pass/Fail Calculation

- Count subjects where ≥ 2 of their 3 hums produced a `complete` verdict. This is the subject's score.
- Pass bar: 4/5 subjects hit `complete` on ≥ 2 of 3 hums.
- Sub-threshold (2–3/5): partial confidence; schedule a repeat round after prompt tuning. Do not flip R003 to validated-partial yet.
- Below threshold (0–1/5): see §Failure Escalation.
- Ties and edge cases: a subject who gets `complete` on exactly 1 of 3 hums counts as a fail. `mixed` or `unclear` verdicts are not `complete`. The coding is binary at the hum level; the pass bar is a majority rule at the subject level.

## Failure Escalation

If 0 or 1 of 5 pass: investigate likely root causes in order:

1. **Prompt templates** — the producer system prompts may be producing repetitive patterns. Review the last 15 real-Claude responses from the UAT, look for structural monotony, identical chord loops, identical rhythmic grids.
2. **Second-pass scope** — the second AI pass is meant to add emotional arc / voicing richness. If second-pass outputs are near-identical to first-pass outputs, the second prompt is not doing its job.
3. **5-layer balance** — all 5 layers are present but gain/EQ balance may be off, making the loop sound thin or muddy. Investigate generated gain and pan values across the 15-hum corpus.
4. **30s loop feel** — tempo and slow-multiplier values may be producing too-short phrases that feel loop-y rather than through-composed. Look at whether the same 4-bar motif is just repeating 8 times with no variation.

Escalation owner: the M003 planner. File a new milestone `M003-musicality-tuning` with the 15-row capture sheet as the primary research input. Do not attempt to tune within M002 — M002 is frozen on V1α scope after C6 runs, regardless of verdict.

## Scope (explicit out-of-scope list)

This protocol validates **R003** only. It does NOT test:

- R007 / R008 edit path — covered by C4 / C5 automated tests plus a sensory UAT deferred to a future milestone.
- C1 / C4 latency under real Claude — future real-API CI smoke job.
- Visual polish, reveal animation quality, copy clarity — separate UX review.
- Mobile browsers, Safari, Firefox — V1α is Chrome-desktop only.
- Voice-preservation fidelity (R004 voice-track) — future milestone.
- Prompt A/B comparisons — C6 is a single-config blind test, not a head-to-head. Head-to-head framing would require a different protocol and a larger subject pool.
