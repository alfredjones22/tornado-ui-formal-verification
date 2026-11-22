import Init

/-
This proof template is checked by Lean's kernel after the marked definitions are
generated from the captured TypeScript validator IR. It proves consequences of
four selected guards and the returned fee/net bindings. It does not prove that
the custom TypeScript extractor, BigInt/ABI parsing, noteIdentity/Pedersen, or
the browser implements this Nat model. Full successful execution implies these
selected guards pass only under the separately stated source-mapping premises.
-/

namespace ValidatorRelease

structure Input where
  proofRecipient : Nat
  recipient : Nat
  proofNullifier : Nat
  derivedNullifier : Nat
  callData : String
  callGas : Nat
  nonce : Nat
  proofFee : Nat
  amount : Nat

structure Output where
  fee : Nat
  net : Nat

-- @SOURCE_DERIVED_DEFINITIONS@

structure SelectedPath (i : Input) : Prop where
  nullifier : ¬ rejectNullifier i
  recipient : ¬ rejectRecipient i
  execution : ¬ rejectExecution i
  fee : ¬ rejectFee i

def Returned (i : Input) (o : Output) : Prop :=
  SelectedPath i ∧ o.fee = sourceFee i ∧ o.net = sourceNet i

private theorem sub_pos_constructive (a b : Nat) (h : b < a) : 0 < a - b := by
  induction b generalizing a with
  | zero => simpa using h
  | succ b ih =>
    cases a with
    | zero => cases h
    | succ a =>
      simpa [Nat.succ_sub_succ_eq_sub] using ih a (Nat.lt_of_succ_lt_succ h)

theorem recipient_matches (i : Input) (o : Output) (h : Returned i o) :
    i.proofRecipient = i.recipient := by
  have hr := h.1.recipient
  dsimp [rejectRecipient] at hr
  exact Decidable.of_not_not hr

theorem no_execution (i : Input) (o : Output) (h : Returned i o) :
    (i.callData = "0x" ∧ i.callGas = 0) ∧ i.nonce = 0 := by
  have he := h.1.execution
  dsimp [rejectExecution] at he
  have hparts := not_or.mp he
  have hfirst := not_or.mp hparts.1
  exact ⟨⟨Decidable.of_not_not hfirst.1, Decidable.of_not_not hfirst.2⟩,
    Decidable.of_not_not hparts.2⟩

theorem fee_proceeds (i : Input) (o : Output) (h : Returned i o) :
    0 < o.fee ∧ o.fee < i.amount ∧ o.net = i.amount - o.fee ∧
    0 < o.net ∧ o.net < i.amount := by
  have hf := h.1.fee
  dsimp [rejectFee] at hf
  have hbounds := not_or.mp hf
  have hpos : 0 < sourceFee i := Nat.lt_of_not_ge hbounds.1
  have hlt : sourceFee i < i.amount := Nat.lt_of_not_ge hbounds.2
  have houtpos : 0 < o.fee := by rw [h.2.1]; exact hpos
  have houtlt : o.fee < i.amount := by rw [h.2.1]; exact hlt
  have hneteq : o.net = i.amount - o.fee := by
    calc
      o.net = sourceNet i := h.2.2
      _ = i.amount - sourceFee i := rfl
      _ = i.amount - o.fee := by rw [h.2.1]
  have hnetlt : o.net < i.amount := by
    rw [hneteq]
    exact Nat.sub_lt_self houtpos (Nat.le_of_lt houtlt)
  have hnetpos : 0 < o.net := by
    rw [hneteq]
    exact sub_pos_constructive i.amount o.fee houtlt
  exact ⟨houtpos, houtlt, hneteq, hnetpos, hnetlt⟩

theorem returned_fee_matches_proof (i : Input) (o : Output) (h : Returned i o) :
    o.fee = i.proofFee := by
  exact h.2.1

theorem selected_nullifier (i : Input) (o : Output) (h : Returned i o) :
    i.proofNullifier = i.derivedNullifier := by
  have hn := h.1.nullifier
  dsimp [rejectNullifier] at hn
  exact Decidable.of_not_not hn

theorem selected_path_inhabited : ∃ i : Input, SelectedPath i := by
  refine ⟨{ proofRecipient := 1, recipient := 1,
            proofNullifier := 1, derivedNullifier := 1,
            callData := "0x", callGas := 0, nonce := 0,
            proofFee := 1, amount := 2 }, ?_⟩
  constructor
  · change ¬ ((1 : Nat) ≠ 1)
    decide
  · change ¬ ((1 : Nat) ≠ 1)
    decide
  · change ¬ ((("0x" : String) ≠ "0x" ∨ (0 : Nat) ≠ 0) ∨ (0 : Nat) ≠ 0)
    decide
  · change ¬ ((1 : Nat) ≤ 0 ∨ (1 : Nat) ≥ 2)
    decide

end ValidatorRelease

#print axioms ValidatorRelease.recipient_matches
#print axioms ValidatorRelease.no_execution
#print axioms ValidatorRelease.fee_proceeds
#print axioms ValidatorRelease.returned_fee_matches_proof
#print axioms ValidatorRelease.selected_nullifier
#print axioms ValidatorRelease.selected_path_inhabited
