import Dexie, { type EntityTable, type Table } from 'dexie';

/**
 * Every row carries updated_at / deleted_at for last-write-wins sync (spec §5.2)
 * and a local dirty flag so Phase 3 sync only has to read, never migrate.
 * Deletion is always soft.
 */

export type ActivityStatus = 'active' | 'done' | 'archived';

export interface Activity {
	id: string;
	parent_id: string | null;
	title: string;
	notes: string | null;
	status: ActivityStatus;
	default_unit: string | null;
	sort_index: number;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	dirty: number;
}

export interface Goal {
	id: string;
	title: string;
	description: string | null;
	color: string;
	is_active: number; // 0 | 1 — IndexedDB can't index booleans
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	dirty: number;
}

export interface ActivityGoal {
	activity_id: string;
	goal_id: string;
	updated_at: number;
	deleted_at: number | null;
	dirty: number;
}

export interface PlannedBlock {
	id: string;
	activity_id: string;
	plan_date: string; // YYYY-MM-DD local
	planned_minutes: number;
	/**
	 * What specifically this block is for ("assignment 3", "read ch. 7").
	 * One-off intent lives here rather than as a child activity, so the tree
	 * only holds things that recur. Unindexed, so no schema version bump.
	 */
	label: string | null;
	start_time: string | null; // HH:MM local, null = unscheduled
	planned_qty: number | null;
	planned_unit: string | null;
	sort_index: number;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	dirty: number;
}

export interface Session {
	id: string;
	activity_id: string;
	planned_block_id: string | null;
	/**
	 * Explicitly kept off the plan (1) — you did this activity but it wasn't
	 * the planned work. Without this, a null planned_block_id is ambiguous:
	 * it can mean "no plan existed yet", which should still match a block
	 * created later. Old rows have no value, which reads as "not opted out".
	 */
	unplanned?: number;
	started_at: number; // epoch ms
	duration_seconds: number;
	note: string | null;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
	dirty: number;
}

export interface SessionMeasure {
	id: string;
	session_id: string;
	unit: string;
	quantity: number;
	updated_at: number;
	deleted_at: number | null;
	dirty: number;
}

export const db = new Dexie('ilana') as Dexie & {
	activity: EntityTable<Activity, 'id'>;
	goal: EntityTable<Goal, 'id'>;
	activity_goal: Table<ActivityGoal, [string, string]>;
	planned_block: EntityTable<PlannedBlock, 'id'>;
	session: EntityTable<Session, 'id'>;
	session_measure: EntityTable<SessionMeasure, 'id'>;
};

db.version(1).stores({
	activity: 'id, parent_id, status, updated_at',
	goal: 'id, updated_at',
	activity_goal: '[activity_id+goal_id], activity_id, goal_id, updated_at',
	planned_block: 'id, plan_date, activity_id, updated_at',
	session: 'id, activity_id, planned_block_id, started_at, updated_at',
	session_measure: 'id, session_id, updated_at'
});
