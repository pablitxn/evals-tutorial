Prepared-agent instructions for integration

Specification-driven regression example

R1: A recommendation identifies exactly one supplied catalog option on the requested route.
R2: Both option and response dates equal the request, with return after outbound.
R3: Report the exact fare plus mandatory fees in the requested currency and integer cents.
R4: The selected full catalog total and reported total are at or below budget; equality is allowed.
R5: Return no_options iff no eligible option exists, with all four itinerary fields null; otherwise recommend.
R6: Always return simulated true and booked false; no booking capability exists.

Baseline reuses the simulated-travel prompt. The deliberately regressing omit-fees variant ignores fees in totals and eligibility and selects the lowest base fare. Both use the real provider runtime and this same dataset. The exact installed prompts and MAF call are shown in agent_consultation.py. No expected references, fixture outputs or evaluator source enter an agent request. No booking.
