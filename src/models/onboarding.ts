/**
 * Types for Onboarding Mode step tracking and validation.
 */

/**
 * Status of an individual onboarding step.
 */
export type StepStatus = 'pending' | 'active' | 'completed' | 'failed';

/**
 * Validation result from a validate.* action.
 */
export interface ValidationResult {
  passed: boolean;
  message: string;
  output?: string;
}

/**
 * State of a single onboarding step (one per slide in onboarding mode).
 */
export interface OnboardingStepState {
  slideIndex: number;
  checkpoint?: string;
  status: StepStatus;
  validationResult?: ValidationResult;
}
