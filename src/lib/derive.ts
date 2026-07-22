/**
 * Derived views (spec §4). Nothing here is stored — everything is computed
 * from sessions and planned blocks. Sessions are the only source of truth.
 */
import type { PlannedBlock, Session } from './db';
import { dateStr, dayBounds } from './time';

export interface BlockStat {
	block: PlannedBlock;
	actualMinutes: number;
	touched: boolean;
	sessions: Session[];
}

export interface DayStats {
	plannedMinutes: number;
	loggedMinutes: number;
	/** minutes logged against any planned block */
	loggedOnPlanMinutes: number;
	blocks: BlockStat[];
	unplanned: Session[];
	/** logged-on-planned / total planned; null when nothing was planned */
	adherence: number | null;
	/** for touched blocks only: actual / planned; null when nothing was touched */
	accuracy: number | null;
}

/** minimal shape needed to walk up the activity tree */
type ParentOf = Map<string, { parent_id: string | null }>;

const minutes = (list: Session[]) => list.reduce((sum, s) => sum + s.duration_seconds / 60, 0);

/**
 * Which block a session belongs to. The stored `planned_block_id` is a hint
 * from logging time, not the whole answer: work is often logged before the
 * plan is written, and that session still belongs to the block once it exists.
 * So the pairing is derived, and only an explicit `unplanned` flag keeps a
 * session off the plan.
 *
 * @param tree when given, a session on a sub-activity also counts toward a
 *             block planned on an ancestor — planning "CSC 306" covers time
 *             logged against "CSC 306 / Problem sets".
 */
function sortBlocks(blocks: PlannedBlock[]): PlannedBlock[] {
	return [...blocks].sort((a, b) =>
		(a.start_time ?? '99') < (b.start_time ?? '99') ? -1 : a.sort_index - b.sort_index
	);
}

/**
 * The block a given activity's time belongs to, or null. Shared by the reports
 * and by the log sheet, so what the sheet promises and what the day counts can
 * never drift apart.
 */
export function findBlockFor(
	blocks: PlannedBlock[],
	activityId: string,
	tree?: ParentOf
): PlannedBlock | null {
	// First block wins when an activity has several that day. A session is
	// atomic, so it is never split across blocks.
	const forActivity = new Map<string, PlannedBlock>();
	for (const b of sortBlocks(blocks)) {
		if (!forActivity.has(b.activity_id)) forActivity.set(b.activity_id, b);
	}
	const exact = forActivity.get(activityId);
	if (exact) return exact;
	if (!tree) return null;
	let cur = tree.get(activityId)?.parent_id ?? null;
	while (cur) {
		const viaAncestor = forActivity.get(cur);
		if (viaAncestor) return viaAncestor;
		cur = tree.get(cur)?.parent_id ?? null;
	}
	return null;
}

export function dayStats(blocks: PlannedBlock[], sessions: Session[], tree?: ParentOf): DayStats {
	const sorted = sortBlocks(blocks);
	const byId = new Map(sorted.map((b) => [b.id, b]));

	const byBlock = new Map<string, Session[]>();
	const unplanned: Session[] = [];
	/** linked to a block from another day: on-plan minutes, but not this day's */
	const stray: Session[] = [];

	const attach = (blockId: string, s: Session) => {
		const list = byBlock.get(blockId) ?? [];
		list.push(s);
		byBlock.set(blockId, list);
	};

	for (const s of sessions) {
		if (s.unplanned) {
			unplanned.push(s);
		} else if (s.planned_block_id) {
			if (byId.has(s.planned_block_id)) attach(s.planned_block_id, s);
			else stray.push(s);
		} else {
			const match = findBlockFor(blocks, s.activity_id, tree);
			if (match) attach(match.id, s);
			else unplanned.push(s);
		}
	}

	const stats: BlockStat[] = sorted.map((block) => {
		const own = byBlock.get(block.id) ?? [];
		return { block, sessions: own, actualMinutes: minutes(own), touched: own.length > 0 };
	});

	const plannedMinutes = blocks.reduce((sum, b) => sum + b.planned_minutes, 0);
	const loggedOnPlanMinutes = stats.reduce((sum, b) => sum + b.actualMinutes, 0) + minutes(stray);

	const touched = stats.filter((b) => b.touched);
	const touchedPlanned = touched.reduce((sum, b) => sum + b.block.planned_minutes, 0);
	const touchedActual = touched.reduce((sum, b) => sum + b.actualMinutes, 0);

	return {
		plannedMinutes,
		loggedMinutes: minutes(sessions),
		loggedOnPlanMinutes,
		blocks: stats,
		// strays stay visible rather than silently folded into the plan
		unplanned: [...unplanned, ...stray].sort((a, b) => a.started_at - b.started_at),
		adherence: plannedMinutes > 0 ? Math.min(1, loggedOnPlanMinutes / plannedMinutes) : null,
		accuracy: touchedPlanned > 0 ? touchedActual / touchedPlanned : null
	};
}

/**
 * Same figures over many days. Matching has to happen per day — a plan only
 * means anything against its own date — so this buckets by local day and sums,
 * rather than treating a whole range as one giant day.
 */
export function rangeStats(blocks: PlannedBlock[], sessions: Session[], tree?: ParentOf): DayStats {
	const days = new Set<string>();
	for (const b of blocks) days.add(b.plan_date);
	for (const s of sessions) days.add(dateStr(new Date(s.started_at)));

	const totals = {
		plannedMinutes: 0,
		loggedMinutes: 0,
		loggedOnPlanMinutes: 0,
		touchedPlanned: 0,
		touchedActual: 0
	};
	const allBlocks: BlockStat[] = [];
	const allUnplanned: Session[] = [];

	for (const day of days) {
		const [start, end] = dayBounds(day);
		const stats = dayStats(
			blocks.filter((b) => b.plan_date === day),
			sessions.filter((s) => s.started_at >= start && s.started_at < end),
			tree
		);
		totals.plannedMinutes += stats.plannedMinutes;
		totals.loggedMinutes += stats.loggedMinutes;
		totals.loggedOnPlanMinutes += stats.loggedOnPlanMinutes;
		for (const b of stats.blocks) {
			if (b.touched) {
				totals.touchedPlanned += b.block.planned_minutes;
				totals.touchedActual += b.actualMinutes;
			}
		}
		allBlocks.push(...stats.blocks);
		allUnplanned.push(...stats.unplanned);
	}

	return {
		plannedMinutes: totals.plannedMinutes,
		loggedMinutes: totals.loggedMinutes,
		loggedOnPlanMinutes: totals.loggedOnPlanMinutes,
		blocks: allBlocks,
		unplanned: allUnplanned.sort((a, b) => a.started_at - b.started_at),
		adherence:
			totals.plannedMinutes > 0 ? Math.min(1, totals.loggedOnPlanMinutes / totals.plannedMinutes) : null,
		accuracy: totals.touchedPlanned > 0 ? totals.touchedActual / totals.touchedPlanned : null
	};
}
