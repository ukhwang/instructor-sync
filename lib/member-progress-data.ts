import { createClient } from '@/lib/supabase/client';
import {
  MemberProgressGoalInput,
  MemberProgressObservationInput,
  MemberProgressResult,
} from './member-progress-types';

function rpcFailure(error: { message?: string } | null): MemberProgressResult {
  return { success: false, retryable: true, reason: error?.message || 'rpc_failed' };
}

async function safely(action: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<MemberProgressResult> {
  try {
    const { data, error } = await action();
    if (error) return rpcFailure(error);
    return data ? data as MemberProgressResult : rpcFailure({ message: 'empty_rpc_response' });
  } catch { return rpcFailure({ message: 'network_error' }); }
}

export async function createMemberProgressGoal(input: MemberProgressGoalInput): Promise<MemberProgressResult> {
  return safely(() => createClient().rpc('create_member_progress_goal', {
    p_request_id: input.request_id,
    p_member_id: input.member_id,
    p_name: input.name,
    p_condition: input.condition,
    p_metric: input.metric,
    p_direction: input.direction,
    p_unit: input.unit,
    p_target_value: input.target_value,
    p_definition_version: input.definition_version,
    p_reassessment_due_on: input.reassessment_due_on || null,
    p_measured_on: input.measured_on,
    p_value: input.value ?? null,
    p_unmeasured_reason: input.unmeasured_reason || null,
    p_source: input.source,
    p_actor: input.actor,
    p_memo: input.memo || null,
    p_opinion: input.opinion || null,
  }));
}

export async function recordMemberProgressObservation(input: MemberProgressObservationInput): Promise<MemberProgressResult> {
  return safely(() => createClient().rpc('record_member_progress_observation', {
    p_request_id: input.request_id,
    p_goal_id: input.goal_id,
    p_definition_version: input.definition_version,
    p_metric: input.metric,
    p_unit: input.unit,
    p_measured_on: input.measured_on,
    p_value: input.value ?? null,
    p_unmeasured_reason: input.unmeasured_reason || null,
    p_source: input.source,
    p_actor: input.actor,
    p_memo: input.memo || null,
    p_opinion: input.opinion || null,
    p_supersedes_observation_id: input.supersedes_observation_id || null,
    p_correction_reason: input.correction_reason || null,
  }));
}

export async function getMemberProgress(memberId: string): Promise<MemberProgressResult> {
  return safely(() => createClient().rpc('get_member_progress', { p_member_id: memberId }));
}
