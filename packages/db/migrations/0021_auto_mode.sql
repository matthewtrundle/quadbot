-- Add 'auto' to the mode enum for fully automated brand operation
ALTER TYPE mode ADD VALUE IF NOT EXISTS 'auto';
