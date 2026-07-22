/**
 * Derived views (spec §4). Nothing here is stored — everything is computed
 * from sessions and planned blocks. Sessions are the only source of truth.
 */
import type { PlannedBlock, Session } from './db';

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

export function dayStats(blocks: PlannedBlock[], sessions: Session[]): DayStats {
	const byBlock = new Map<string, Session[]>();
	const unplanned: Session[] = [];
	for (const s of sessions) {
		if (s.planned_block_id) {
			const list = byBlock.get(s.planned_block_id) ?? [];
			list.push(s);
			byBlock.set(s.planned_block_id, list);
		} else {
			unplanned.push(s);
		}
	}

	const minutes = (list: Session[]) => list.reduce((sum, s) => sum + s.duration_seconds / 60, 0);

	const sorted = [...blocks].sort((a, b) =>
		(a.start_time ?? '99') < (b.start_time ?? '99') ? -1 : a.sort_index - b.sort_index
	);

	const stats: BlockStat[] = sorted.map((block) => {
		const own = byBlock.get(block.id) ?? [];
		return { block, sessions: own, actualMinutes: minutes(own), touched: own.length > 0 };
	});

	// Sessions pointing at a block from another day still count as planned work
	// here, and are listed alongside unplanned sessions so they stay visible.
	const knownBlockIds = new Set(blocks.map((b) => b.id));
	const strayOnPlan = [...byBlock.entries()]
		.filter(([blockId]) => !knownBlockIds.has(blockId))
		.flatMap(([, list]) => list);
	unplanned.push(...strayOnPlan);

	const plannedMinutes = blocks.reduce((sum, b) => sum + b.planned_minutes, 0);
	const loggedMinutes = minutes(sessions);
	const loggedOnPlanMinutes = stats.reduce((sum, b) => sum + b.actualMinutes, 0) + minutes(strayOnPlan);

	const touched = stats.filter((b) => b.touched);
	const touchedPlanned = touched.reduce((sum, b) => sum + b.block.planned_minutes, 0);
	const touchedActual = touched.reduce((sum, b) => sum + b.actualMinutes, 0);

	return {
		plannedMinutes,
		loggedMinutes,
		loggedOnPlanMinutes,
		blocks: stats,
		unplanned: unplanned.sort((a, b) => a.started_at - b.started_at),
		adherence: plannedMinutes > 0 ? Math.min(1, loggedOnPlanMinutes / plannedMinutes) : null,
		accuracy: touchedPlanned > 0 ? touchedActual / touchedPlanned : null
	};
}
