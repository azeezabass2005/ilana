/**
 * The one data layer module (spec §7): every read and write goes through here
 * so the store can be swapped. All writes stamp updated_at and dirty for sync.
 */
import { v7 as uuidv7 } from 'uuid';
import {
	db,
	type Activity,
	type ActivityStatus,
	type Goal,
	type PlannedBlock,
	type Session,
	type SessionMeasure
} from './db';

const now = () => Date.now();

function stamp<T extends object>(row: T): T & { updated_at: number; dirty: number } {
	return { ...row, updated_at: now(), dirty: 1 };
}

// ---------- activities ----------

export async function createActivity(input: {
	title: string;
	parent_id?: string | null;
	notes?: string | null;
	default_unit?: string | null;
}): Promise<Activity> {
	const parent = input.parent_id ?? null;
	const siblings = await db.activity.filter((a) => a.parent_id === parent && a.deleted_at === null).count();
	const row: Activity = stamp({
		id: uuidv7(),
		parent_id: input.parent_id ?? null,
		title: input.title.trim(),
		notes: input.notes ?? null,
		status: 'active' as ActivityStatus,
		default_unit: input.default_unit?.trim() || null,
		sort_index: siblings,
		created_at: now(),
		updated_at: 0,
		deleted_at: null,
		dirty: 1
	});
	await db.activity.add(row);
	return row;
}

export async function updateActivity(
	id: string,
	patch: Partial<Pick<Activity, 'title' | 'notes' | 'status' | 'default_unit' | 'parent_id' | 'sort_index'>>
) {
	await db.activity.update(id, stamp(patch));
}

export async function softDeleteActivity(id: string) {
	await db.activity.update(id, stamp({ deleted_at: now() }));
}

export function liveActivities() {
	return db.activity.filter((a) => a.deleted_at === null).toArray();
}

/** children grouped by parent, live rows only, sorted */
export function buildTree(activities: Activity[]): Map<string | null, Activity[]> {
	const byParent = new Map<string | null, Activity[]>();
	for (const a of activities) {
		const list = byParent.get(a.parent_id) ?? [];
		list.push(a);
		byParent.set(a.parent_id, list);
	}
	for (const list of byParent.values()) list.sort((a, b) => a.sort_index - b.sort_index);
	return byParent;
}

/** every id in the subtree rooted at rootId (inclusive) */
export function subtreeIds(activities: Activity[], rootId: string): Set<string> {
	const byParent = buildTree(activities);
	const ids = new Set<string>([rootId]);
	const queue = [rootId];
	while (queue.length) {
		const cur = queue.pop()!;
		for (const child of byParent.get(cur) ?? []) {
			if (!ids.has(child.id)) {
				ids.add(child.id);
				queue.push(child.id);
			}
		}
	}
	return ids;
}

/** id → activity map */
export function indexById(activities: Activity[]): Map<string, Activity> {
	return new Map(activities.map((a) => [a.id, a]));
}

/** ancestor chain, root first, excluding the activity itself */
export function ancestors(byId: Map<string, Activity>, id: string): Activity[] {
	const chain: Activity[] = [];
	let cur = byId.get(id)?.parent_id ?? null;
	while (cur) {
		const a = byId.get(cur);
		if (!a) break;
		chain.unshift(a);
		cur = a.parent_id;
	}
	return chain;
}

// ---------- goals ----------

export async function createGoal(input: { title: string; description?: string | null; color: string }): Promise<Goal> {
	const row: Goal = stamp({
		id: uuidv7(),
		title: input.title.trim(),
		description: input.description ?? null,
		color: input.color,
		is_active: 1,
		created_at: now(),
		updated_at: 0,
		deleted_at: null,
		dirty: 1
	});
	await db.goal.add(row);
	return row;
}

export async function updateGoal(id: string, patch: Partial<Pick<Goal, 'title' | 'description' | 'color' | 'is_active'>>) {
	await db.goal.update(id, stamp(patch));
}

export async function softDeleteGoal(id: string) {
	await db.goal.update(id, stamp({ deleted_at: now() }));
}

export function liveGoals() {
	return db.goal.filter((g) => g.deleted_at === null).toArray();
}

// ---------- activity ↔ goal tagging ----------

export async function tagActivity(activity_id: string, goal_id: string) {
	await db.activity_goal.put(stamp({ activity_id, goal_id, updated_at: 0, deleted_at: null, dirty: 1 }));
}

export async function untagActivity(activity_id: string, goal_id: string) {
	await db.activity_goal.update([activity_id, goal_id], stamp({ deleted_at: now() }));
}

export function liveTags() {
	return db.activity_goal.filter((t) => t.deleted_at === null).toArray();
}

/**
 * Effective goals = union of goals tagged on the activity and every ancestor (spec §3.3).
 */
export function effectiveGoals(
	byId: Map<string, Activity>,
	tags: { activity_id: string; goal_id: string }[],
	activityId: string
): Set<string> {
	const tagsByActivity = new Map<string, string[]>();
	for (const t of tags) {
		const list = tagsByActivity.get(t.activity_id) ?? [];
		list.push(t.goal_id);
		tagsByActivity.set(t.activity_id, list);
	}
	const out = new Set<string>();
	let cur: string | null = activityId;
	while (cur) {
		for (const g of tagsByActivity.get(cur) ?? []) out.add(g);
		cur = byId.get(cur)?.parent_id ?? null;
	}
	return out;
}

// ---------- planned blocks ----------

export async function createPlannedBlock(input: {
	activity_id: string;
	plan_date: string;
	planned_minutes: number;
	label?: string | null;
	start_time?: string | null;
	planned_qty?: number | null;
	planned_unit?: string | null;
}): Promise<PlannedBlock> {
	const count = await db.planned_block.where('plan_date').equals(input.plan_date).count();
	const row: PlannedBlock = stamp({
		id: uuidv7(),
		activity_id: input.activity_id,
		plan_date: input.plan_date,
		planned_minutes: input.planned_minutes,
		label: input.label?.trim() || null,
		start_time: input.start_time ?? null,
		planned_qty: input.planned_qty ?? null,
		planned_unit: input.planned_unit ?? null,
		sort_index: count,
		created_at: now(),
		updated_at: 0,
		deleted_at: null,
		dirty: 1
	});
	await db.planned_block.add(row);
	return row;
}

export async function updatePlannedBlock(
	id: string,
	patch: Partial<
		Pick<PlannedBlock, 'planned_minutes' | 'label' | 'start_time' | 'planned_qty' | 'planned_unit' | 'sort_index'>
	>
) {
	await db.planned_block.update(id, stamp(patch));
}

export async function softDeletePlannedBlock(id: string) {
	await db.planned_block.update(id, stamp({ deleted_at: now() }));
}

export function livePlannedBlocks(date: string) {
	return db.planned_block
		.where('plan_date')
		.equals(date)
		.filter((b) => b.deleted_at === null)
		.toArray();
}

export function livePlannedBlocksRange(from: string, to: string) {
	return db.planned_block
		.where('plan_date')
		.between(from, to, true, true)
		.filter((b) => b.deleted_at === null)
		.toArray();
}

// ---------- sessions ----------

export async function logSession(input: {
	activity_id: string;
	started_at: number;
	duration_seconds: number;
	planned_block_id?: string | null;
	unplanned?: boolean;
	note?: string | null;
	measures?: { unit: string; quantity: number }[];
}): Promise<Session> {
	const row: Session = stamp({
		id: uuidv7(),
		activity_id: input.activity_id,
		planned_block_id: input.planned_block_id ?? null,
		unplanned: input.unplanned ? 1 : 0,
		started_at: input.started_at,
		duration_seconds: Math.max(1, Math.round(input.duration_seconds)),
		note: input.note?.trim() || null,
		created_at: now(),
		updated_at: 0,
		deleted_at: null,
		dirty: 1
	});
	await db.transaction('rw', db.session, db.session_measure, async () => {
		await db.session.add(row);
		for (const m of input.measures ?? []) {
			if (!m.unit.trim() || !m.quantity) continue;
			const measure: SessionMeasure = stamp({
				id: uuidv7(),
				session_id: row.id,
				unit: m.unit.trim(),
				quantity: m.quantity,
				updated_at: 0,
				deleted_at: null,
				dirty: 1
			});
			await db.session_measure.add(measure);
		}
	});
	return row;
}

export async function softDeleteSession(id: string) {
	await db.session.update(id, stamp({ deleted_at: now() }));
}

export function liveSessionsBetween(startMs: number, endMs: number) {
	return db.session
		.where('started_at')
		.between(startMs, endMs, true, false)
		.filter((s) => s.deleted_at === null)
		.toArray();
}

export function liveSessionsForActivities(ids: Set<string>) {
	return db.session.filter((s) => s.deleted_at === null && ids.has(s.activity_id)).toArray();
}

export function liveMeasuresFor(sessionIds: string[]) {
	return db.session_measure
		.where('session_id')
		.anyOf(sessionIds)
		.filter((m) => m.deleted_at === null)
		.toArray();
}

/** most recently logged activity id, for the two-tap default (spec §6) */
export async function lastLoggedActivityId(): Promise<string | null> {
	const last = await db.session.orderBy('started_at').filter((s) => s.deleted_at === null).last();
	return last?.activity_id ?? null;
}

/**
 * Distinct activities you logged most recently, newest first. The picker puts
 * these on top: you log the same few things repeatedly, so the common case
 * should need no typing and no scrolling.
 */
export async function recentActivityIds(limit = 5): Promise<string[]> {
	const recent = await db.session
		.orderBy('started_at')
		.reverse()
		.filter((s) => s.deleted_at === null)
		.limit(200)
		.toArray();
	const out: string[] = [];
	for (const s of recent) {
		if (!out.includes(s.activity_id)) out.push(s.activity_id);
		if (out.length >= limit) break;
	}
	return out;
}

/** distinct units seen in history, most recent first, for autocomplete */
export async function knownUnits(): Promise<string[]> {
	const measures = await db.session_measure.filter((m) => m.deleted_at === null).toArray();
	measures.sort((a, b) => b.updated_at - a.updated_at);
	const seen = new Set<string>();
	for (const m of measures) seen.add(m.unit);
	return [...seen];
}
