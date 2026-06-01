import { IsIn } from 'class-validator';

export const ASSIGNMENT_TRANSITION_TARGETS = ['confirmed', 'in_progress', 'completed'] as const;

export type AssignmentTransitionTarget = (typeof ASSIGNMENT_TRANSITION_TARGETS)[number];

export class TransitionAssignmentDto {
  @IsIn(ASSIGNMENT_TRANSITION_TARGETS)
  to!: AssignmentTransitionTarget;
}
