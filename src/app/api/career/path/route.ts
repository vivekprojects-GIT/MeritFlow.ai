import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { matchRoles, roleById } from '@/lib/career/roles';
import { goalsProgress, nextSkills, possibleRoles } from '@/lib/career/skill-file';
import { listGoals } from '@/lib/career/goals-store';
import { getSkillFile, saveGoal } from '@/lib/career/skill-file-store';

export const runtime = 'nodejs';

/**
 * Where the learner's finished work is taking them.
 *
 * Returns three things, and the order matters: what they have earned, what
 * that already points toward, and — if they have named a goal — how far it
 * still is with the missing pieces listed.
 *
 * Coverage is always a proportion with the gap named. "You could become a
 * structural engineer" after three courses is flattery a student might act on;
 * "three of five essentials, and here are the other two" is something they can
 * use.
 */
async function payload(userId: string) {
  const [file, saved] = await Promise.all([getSkillFile(userId), listGoals(userId)]);

  /* Every goal, in the order the learner set them, newest first. Showing only
     the most recent was a lie of omission on an account with three: the
     dashboard reported one coverage bar while the goals page reported three,
     and the two pages disagreed about what the learner was working on. */
  const goals = goalsProgress(file, saved.map((g) => g.roleId).filter(Boolean));

  const asGoal = (m: (typeof goals)[number]) => ({
    roleId: m.role.id,
    title: m.role.title,
    summary: m.role.summary,
    coverage: m.coverage,
    held: m.coreHeld,
    missing: m.coreMissing,
  });

  return {
    goalText: file.goalText,
    completedCourses: file.completedCourses,
    skills: file.skills,
    goals: goals.map(asGoal),
    /* The most recent goal, still sent on its own. Older clients read this
       field, and a goal count of one should not have to be special-cased by
       every caller. */
    goal: goals[0] ? asGoal(goals[0]) : null,
    couldBecome: possibleRoles(file)
      /* A career already on the list is not a suggestion. Before this, setting
         "Civil Engineer" as a goal left it sitting under "what you could
         become" as though it were news. */
      .filter((m) => !goals.some((g) => g.role.id === m.role.id))
      .map((m) => ({
        roleId: m.role.id,
        title: m.role.title,
        discipline: m.role.discipline,
        summary: m.role.summary,
        coverage: m.coverage,
        held: m.coreHeld,
        missing: m.coreMissing,
      })),
    learnNext: nextSkills(file, 6, goals),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await payload(user.id));
}

/**
 * Set or change the goal.
 *
 * A learner may type a career name, or describe the work. When the wording
 * matches several careers the choices come back rather than one of them being
 * picked: "civil engineer" and "structural engineer" are different jobs, and
 * choosing for someone sends them down the wrong path silently.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; roleId?: string };
  const text = String(body.text ?? '').trim();
  const roleId = String(body.roleId ?? '').trim();

  if (!text && !roleId) return NextResponse.json({ error: 'Tell us what you want to become.' }, { status: 400 });

  if (roleId && !roleById(roleId)) {
    return NextResponse.json({ error: 'That is not a career we know yet.' }, { status: 400 });
  }

  /* Ambiguous wording, no choice made: return the options instead of guessing. */
  if (!roleId) {
    const matches = matchRoles(text);
    if (matches.length > 1) {
      return NextResponse.json({
        needsChoice: true,
        text,
        options: matches.map((r) => ({ roleId: r.id, title: r.title, summary: r.summary })),
      });
    }
    if (matches.length === 0) {
      return NextResponse.json({
        needsChoice: true,
        text,
        options: [],
        message:
          'We could not match that to a career we track yet. Your goal is saved, and finishing courses still builds your skill file.',
      });
    }
  }

  await saveGoal(user.id, text, roleId || null);
  return NextResponse.json(await payload(user.id));
}
