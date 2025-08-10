// Difficulty presets. Tweak freely.
window.DIFFICULTIES = {
  easy: {
    TIMER_START: 30,
   TIME_BONUS_PER_CORRECT: 2,  // +1s per correct
    TIME_PENALTY_WRONG: 1,      // still no extra time loss
    WRONG_PENALTY: 0.08,
    CHALLENGE_REWARD: 0.35,
    S0: 280,                 // initial snake speed
    SPEED_PER_CHALLENGE: 10,
    DRIFT_AMP_MIN: 8,        // bubble drift amplitude
    DRIFT_AMP_MAX: 16,
    DRIFT_SPEED_MIN: 0.55,
    DRIFT_SPEED_MAX: 0.95,
    DRIFT_RAMP_CHALLENGES: 14
  },
  normal: {
    TIMER_START: 25,
   TIME_BONUS_PER_CORRECT: 1,  // +1s per correct
    TIME_PENALTY_WRONG: 1,      // still no extra time loss
    WRONG_PENALTY: 0.10,
    CHALLENGE_REWARD: 0.30,
    S0: 300,
    SPEED_PER_CHALLENGE: 12,
    DRIFT_AMP_MIN: 15,
    DRIFT_AMP_MAX: 25,
    DRIFT_SPEED_MIN: 0.95,
    DRIFT_SPEED_MAX: 1.70,
    DRIFT_RAMP_CHALLENGES: 12
  },
  hard: {
    TIMER_START: 20,
   TIME_BONUS_PER_CORRECT: 1,  // +1s per correct
    TIME_PENALTY_WRONG: 2,      // still no extra time loss
    WRONG_PENALTY: 0.12,
    CHALLENGE_REWARD: 0.28,
    S0: 320,
    SPEED_PER_CHALLENGE: 14,
    DRIFT_AMP_MIN: 18,
    DRIFT_AMP_MAX: 28,
    DRIFT_SPEED_MIN: 1.05,
    DRIFT_SPEED_MAX: 1.90,
    DRIFT_RAMP_CHALLENGES: 10
  }
};
