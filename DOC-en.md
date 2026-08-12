# ShopAssistant Research Project Documentation

## Abstract

ShopAssistant is a prototype system for research on online consumption decisions. It examines a risk that AI interventions may create beyond reducing impulse purchases: **over-restraint**. BuyMate (ACM CHI 2026) explored how AI interventions can promote rational consumption in live commerce. Building on its idea of offering support at pivotal decision points, this project asks a further question: when a system repeatedly warns of risk, delays purchases, or encourages users to forgo them, might it inadvertently cause users to postpone or avoid purchases that they genuinely need, can afford, and understand well enough to make?

This project no longer treats “preventing a purchase” as the default measure of success. Instead, it helps users decide whether purchasing is appropriate at that moment. Through two complementary roles—a seller agent and a steward agent—the backend large language model guides users to consider their needs, budgets, available information, and emotional pressure. It then provides one of three transparent and reviewable recommendations: buy now, verify more information, or do not make this purchase for now. Users retain the final decision, while recommendations, reasons, user actions, and final decisions are recorded as research data.

## 1. Research Background

Countdowns, stock scarcity, social proof, strikethrough prices, and limited-time offers in online shopping compress the time users have to reflect on their needs and compare options, potentially triggering impulse purchases. Live commerce concentrates these cues, but similar pressure also exists on general e-commerce platforms, in group buying, pre-sales, and subscription consumption.

Existing rational-consumption interventions commonly emphasize pausing, cooling down, budget calibration, delaying, or cancelling a purchase. Although these strategies can reduce immediate impulses, they may also imply a value stance that “buying less is always better.” For users with a clear need, sufficient budget, adequate product information, or a genuinely constrained purchase window, an excessively defensive system can create unnecessary delay, decision fatigue, opportunity costs, and even lower trust in AI advice.

ShopAssistant therefore understands consumption decisions as judgments of **purchase appropriateness**, rather than unilateral suppression of buying. The system should identify impulse, information gaps, and budget pressure, while also supporting users in confidently completing a reasonable purchase when the evidence is sufficient.

## 2. Research Objectives

This project aims to:

1. Build a configurable and loggable experimental environment for online consumption decisions.
2. Test whether AI interventions may unintentionally lead to over-restraint, delay, or avoidance of reasonable purchases.
3. Explore how AI can balance reducing impulse purchases with supporting reasonable purchases.
4. Compare how seller agents, steward agents, and their combination affect users’ judgment processes and decision outcomes.
5. Translate need, budget, information sufficiency, and emotional pressure into explainable, triggerable, and recordable decision checks.
6. Provide an extensible foundation for subsequent experiments, questionnaires, interviews, and behavioral-log analysis.

## 3. Theoretical Perspectives

ShopAssistant’s design does not equate “rationality” with “buying less.” The following theories jointly support treating purchase, verification, and postponement as equally legitimate possible outcomes.

| Theory and evidence | Implications for this research | Constraints on system design |
| --- | --- | --- |
| Dual-process decision making and impulse-buying tendency [1][2] | Time pressure, scarcity, and emotional arousal can shorten careful comparison; impulse buying has both affective and cognitive components. | Under high pressure, prompt users to pause and consider their budget and information gaps, but do not infer from pressure cues alone that they should not buy. |
| Self-regulation, hedonic precommitment, and hyperopia [3] | Insufficient self-control can cause impulse purchases, but an excessive preference for “should” choices can also make people miss reasonable, valuable consumption. | Treat “unnecessary delay of or withdrawal from a purchase that fits the user’s needs and budget” as an independent outcome measure, rather than counting non-purchase as success by default. |
| Theory of planned behavior [4] | Attitudes, subjective norms, and perceived behavioral control jointly shape behavioral intention; “everyone else is buying” changes perceived norms, while budget and information affect perceived control. | Ask separately about genuine need, social influence, budget headroom, and information available; do not replace a complete assessment with a single pressure score. |
| Persuasion knowledge model [5] | When users understand the intent and tactics behind marketing messages, they can assess claims more consciously. | Rewrite promotional language as verifiable neutral facts, distinguishing “seller claims” from “verified evidence,” rather than suppressing purchases through counter-persuasion. |
| Self-determination theory [6] | Coercive or shaming advice undermines autonomy; support that preserves choice, explains reasons, and builds competence is more likely to be internalized. | Explain the rationale and uncertainty behind every recommendation, preserve paths to ignore it, add information, and decide independently, and never coerce users with “you should.” |
| Calibration of trust in automation [7][8] | Users may over-rely on algorithms, or abandon them entirely after one error; explainability alone does not ensure appropriate trust. | Show the basis for recommendations, evidence sources, confidence boundaries, and items still to verify; do not provide definitive purchase conclusions in high-impact situations. |

### 3.1 Operational Definitions of Three Decision Risks

To avoid conflating value judgments, formal studies should establish an independent annotation of “purchase appropriateness” for each product scenario in advance, rather than inferring whether a user was rational from AI output or behavioral outcomes.

| Outcome | Minimum identification criteria | What must not be inferred directly |
| --- | --- | --- |
| Impulse purchase | After pressure cues, the user quickly submits a purchase while needs are unclear, the budget is unsuitable, or key information is missing. | A fast purchase does not automatically equal an impulse purchase; an urgent and well-informed purchase may be appropriate. |
| Reasonable purchase | Need, budget, product fit, and key information all meet research-defined thresholds, and the user can state the main reasons. | A reasonable purchase is not risk-free, nor does it require an AI recommendation. |
| Over-restraint | After the threshold for a reasonable purchase has been met, the user unnecessarily delays, abandons, or avoids it because of AI advice or intervention, and confirms on delayed reassessment that this result was not in their own interest. | A single “do not buy now” decision does not equal over-restraint; a delay may yield better information or pricing. |

This definition is consistent with the discussion of excessive self-control in [3] and responds to the emphasis on autonomy in [6]: whether a purchase is appropriate must be judged jointly through transparent research criteria, user reasons, and post-delay evaluation.

### 3.2 Testable Hypotheses

- H1: Compared with a no-AI condition, a steward agent may reduce immediate submission in high-pressure, low-appropriateness scenarios, but increase the rate of postponement in high-appropriateness scenarios.
- H2: Compared with a single steward agent, dual-agent collaboration will reduce over-restraint in high-appropriateness scenarios while maintaining or reducing impulse purchases in low-appropriateness scenarios.
- H3: Recommendations that present evidence, items to verify, and an option to ignore them will better increase perceived autonomy and appropriate trust than deterministic directives, while reducing the likelihood of blindly following advice.

### 3.3 Five-technique protocol

To make the research page more than a seller/butler chat, the current flow extends BuyMate’s two core modules into five observable, reviewable, and logged techniques. Each technique combines an interface action, an agent instruction for a specific round, and an `intervention_check` event. None treats “do not buy” as the default success outcome.

| Technique | Participant action | ShopAssistant agent behavior | Main source (JCR Q1 research label) |
| --- | --- | --- | --- |
| Reflective pause | Ask whether the need remains if the promotion cue disappears, while keeping buying after the pause legitimate. | The third seller/butler round invites a 10-second pause and records the participant’s reason, certainty, and information gap. | Mischel, Shoda, & Rodriguez (1989), *Journal of Personality and Social Psychology* |
| Persuasion knowledge and neutral reframing | Separate seller claims, checkable facts, and evidence gaps. | The first seller round reframes urgency, popularity, and scarcity language without creating counter-pressure. | Friestad & Wright (1994), *Journal of Consumer Research* |
| Controlled comparison | Select up to three candidates and compare them on the same dimensions. | The second seller round uses only catalog facts and marks missing fields as unverified; it does not treat the cheapest option as correct. | Iyengar & Lepper (2000), *Journal of Personality and Social Psychology* |
| Budget calibration and mental accounting | Place total price, budget cap, alternatives, frequency of use, and opportunity cost together. | The first butler round uses only participant-provided numbers; a comfortable budget and clear need may support buying. | Kivetz & Simonson (2002), *Journal of Consumer Research* |
| Implementation intention | Write a short, executable “if–then” plan that permits either buying or declining. | The second butler round sets a bounded review time and one fact to verify. | Gollwitzer (1999), *American Psychologist* |

Self-determination theory (Deci & Ryan, 2000, *Psychological Inquiry*, JCR Q1) is the interaction constraint across all five techniques: the AI explains reasons and uncertainty and preserves paths to ignore advice, add information, delay, or buy now. Q1 depends on year and category; the UI label is a research-provenance marker and should be rechecked against the institution’s latest Journal Citation Reports before preregistration or publication.

## 4. Relationship to BuyMate

ShopAssistant is inspired by BuyMate, *Making AI Interventions Effective in Promoting Rational Consumption in Live Commerce*. It carries forward BuyMate’s research interest in using AI to support reflection at key consumption-decision moments, but does not reproduce its full experimental procedure, scales, statistical models, or live-streaming capabilities.

The key difference lies in the research boundary: BuyMate focuses on making AI interventions more effective in promoting rational consumption; ShopAssistant makes the possibility that **the intervention itself is excessive** part of the research object. It examines not only whether a system can reduce impulse purchases, but also whether it wrongly prevents purchases that are appropriate, and which forms of advice can both reduce impulse risk and minimize unnecessary purchase hesitation.

The current prototype does not include streamer-audio transcription, real-time product-switch detection, live-interaction replication, or an automated `G1 → G2 → G3` sales-language analysis pipeline. Live commerce serves only as an optional high-pressure research context; sales-language categories, pressure scores, and similar-product rankings all serve ShopAssistant’s general consumption-decision research.

## 5. Research Questions

- RQ1: Can AI interventions inadvertently cause over-restraint, such as unnecessary delay, abandonment, or avoidance of products that would otherwise be appropriate to purchase?
- RQ2: How do seller agents and steward agents respectively affect users’ assessments of need, budget, information sufficiency, and emotional pressure?
- RQ3: What AI recommendation strategies can balance reducing impulse purchases with supporting reasonable purchases?
- RQ4: Which situations, user states, or product characteristics are more likely to produce impulse-purchase, reasonable-purchase, and over-restraint outcomes?
- RQ5: When the two agents agree or disagree, how do users interpret the advice, seek verification, and reach a final decision?
- RQ6: Can explaining the basis, uncertainty, and alternative actions behind recommendations improve user autonomy, decision confidence, and appropriate trust in AI?

## 6. Conceptual Model

ShopAssistant’s research model can be summarized as:

**Context and user state → dual-agent review → purchase-appropriateness recommendation → user decision and subsequent evaluation**

Context and user state include promotional pressure, product-information quality, urgency of genuine need, disposable budget, alternatives, emotional pressure, and time constraints. The seller agent actively encourages buying from the perspectives of product value, use context, after-sales service, and alternatives. The steward agent checks for impulse cues, budget pressure, information gaps, and irreversibility risk, and preferentially encourages not buying or continued observation. Their structured output is no longer advice to the user; it analyzes whether the user's current language leans toward buying, continuing to observe, or not buying.

After integrating these checks, the system presents one of the following recommendations, together with its reasons and matters to confirm:

| Recommendation | Applicable situation | System support |
| --- | --- | --- |
| Buy now | The need is clear, the budget permits it, key information is sufficient, and no significant emotional or promotional-pressure risk is found. | Summarize the basis for purchase, remind users to check key terms, and support completion of a simulated decision. |
| Verify more information | Key uncertainties remain about the product, price, fit, after-sales service, or alternatives. | List specific items to verify, provide comparison and lookup paths, then let the user decide. |
| Do not make this purchase for now | Need is unclear, budget is under pressure, emotions are highly volatile, or risks clearly outweigh the current value. | Explain the basis for postponement, offer a cooling-off or delayed-review path, and avoid framing postponement as failure. |

Users may accept, question, supplement, or ignore recommendations. Research outcomes record not only whether a purchase is submitted, but also whether advice and final choice align, whether users feel inappropriately discouraged, and whether they still consider the choice to serve their interests after a delay.

## 7. Dual-Agent Study Conditions

The current prototype can be configured with the following study conditions:

- **Seller agent:** focuses on clarifying product value and fit for use and preferentially encourages buying by connecting needs, functions, price composition, alternatives, and timing; it must not create pressure through urgency, scarcity, or social-proof language.
- **Steward agent:** focuses on identifying impulse, budget pressure, information gaps, and emotional influence, preferentially encouraging not buying or continued observation while helping users verify risks and distinguish genuine needs from immediate triggers.
- **Dual-agent collaboration:** presents complementary perspectives in the same decision and explicitly shows consensus, disagreement, evidence, and information that still needs user confirmation.
- **Neutral or no-AI control:** used to compare the effect of AI advice itself, its wording, and its timing on purchase appropriateness and over-restraint.
- **Decision-support tools:** need reflection, budget calibration, similar-product comparison, neutral rewriting of sales language, information-verification checklists, cooling-off delays, and pre-checkout checks.

## 8. Prototype as a Research Tool

ShopAssistant is not a real e-commerce system and does not depend on a live-streaming platform. Products in the system are research samples; the pending-purchase list represents purchase intent, and orders represent simulated decision records. Researchers can analyze users’ judgment processes through behavioral logs, AI conversations, agent recommendations, pressure profiles, and submission records.

Major research events include:

| Event | Research significance |
| --- | --- |
| Browsing a sample | Product exposure, initial interest, and dwell time |
| Adding to pending purchases | Initial purchase intention |
| Removing from pending purchases | Decision withdrawal; its reasons must be considered when judging over-restraint |
| Seller/steward agent conversations | Which decision perspective users actively seek |
| Recommendation generation and viewing | Exposure to AI recommendations, reasons, confidence, and items to verify |
| Information verification and comparison | Whether users fill the information needed for a decision |
| Pressure test and pressure profile | Perceived situational pressure and frequent cues |
| Cooling-off mini-game or delay | Non-AI attentional shifting and postponed decision-making |
| Submission record and subsequent evaluation | Final simulated decision, decision confidence, anticipated regret, and advice alignment |

The research dashboard can aggregate behavioral volume, sessions, agent use, recommendation distribution, intervention-use frequency, and pressure distribution. The product-insights page can show browsing, pending-purchase additions, decisions, AI use, and a recent activity timeline for each sample.

## 9. Variables and Measures

### Independent Variables

- AI condition: seller agent, steward agent, dual agent, neutral AI, or no AI.
- AI recommendation: buy now, verify more information, or do not buy for now, as well as its rationale, certainty, and timing of presentation.
- Contextual factors: time limits, scarcity, social proof, discount anchoring, completeness of product information, and purchase window.
- User state: need urgency, budget headroom, availability of alternatives, prior knowledge, and emotional pressure.
- Support strategies: need reflection, budget calibration, similar-product comparison, sales-language reframing, information verification, cooling-off delay, and pre-checkout checks.

### Process Measures

- Frequency of use, conversation length, recommendation content, and disagreement between the two types of agents.
- Viewing, accepting, questioning, or ignoring recommendations; requesting more information; and information-verification behavior.
- Pressure score, pressure level, and frequency of each kind of pressure cue.
- Time intervals from browsing to adding, adding to recommendation, and recommendation to submission or abandonment.

### Outcome Measures

- **Purchase appropriateness:** multidimensional evaluation of the final choice using predefined criteria for need, budget, information sufficiency, and product fit.
- **Impulse-purchase tendency:** immediate submission under high pressure, low need, budget mismatch, or insufficient information.
- **Over-restraint tendency:** unnecessary delay, abandonment, or avoidance caused by AI intervention despite a clear need, sufficient budget, adequate information, and product fit.
- **User experience:** decision confidence, perceived autonomy, anticipated regret, cognitive load, perceived fairness of advice, and trust in AI.

“Over-restraint” should not be determined from a single non-purchase action. It should be identified jointly using the appropriateness criteria for experimental materials, users’ self-reported reasons, delayed reassessment, and subsequent evaluation.

## 10. Directions for Data Analysis

Researchers can conduct:

- Descriptive statistics for browsing, adding, submitting, postponing, information verification, and recommendation-trigger counts.
- Condition comparisons of impulse purchase, reasonable purchase, and over-restraint-related measures across agent conditions.
- Recommendation-calibration analysis to test alignment between the AI’s three recommendations, predefined purchase-appropriateness standards, users’ final choices, and subsequent evaluations.
- Path analysis of session trajectories such as “browse → consult agent → verify information → recommendation → submit/postpone.”
- Disagreement analysis of how users handle uncertainty and conflicting advice when seller and steward agents disagree.
- Heterogeneity analysis of moderating effects from budget pressure, need urgency, emotional state, information literacy, and impulse-buying tendency.
- Mixed-methods research combining logs, questionnaires, interviews, and open-ended feedback to explain when users feel appropriately supported, excessively blocked, or improperly encouraged.

## 11. Ethics and Boundaries

ShopAssistant is a research prototype and must not be presented as a real, professional, or personalized consumer-advice system. Formal studies should:

- Inform participants that the system records behavior, AI conversations, recommendations, and simulated decisions.
- Explain that “orders” in the system are not real purchases and that AI recommendations do not constitute financial, legal, or professional advice.
- Prohibit seller agents from using manipulative or urgent sales tactics, or tactics based on vulnerable user states.
- Prohibit steward agents from discouraging purchases through shame, fear, or blanket rejection.
- Present the basis, limitations, and uncertainty of recommendations, and preserve users’ right to bypass advice or request more information.
- De-identify exported data, provide a withdrawal mechanism, and obtain informed consent and ethics approval before collecting data.
- Record models, prompts, parameters, sample materials, AI enablement status, recommendation rules, and project versions to ensure reproducibility.

## 12. Project Limitations

- The current prototype does not include BuyMate’s full experimental procedure, scales, or statistical scripts.
- “Purchase appropriateness” and “over-restraint” must be operationalized in advance for the research context; they cannot be determined directly from model output or a single behavioral measure.
- The pressure score is a heuristic indicator, not a validated psychometric scale.
- Sample materials, budget scenarios, product information, and criteria for reasonable purchase still require systematic design around a specific research question.
- AI output is affected by the model, prompts, and parameters; the perspectives of both agents may also be incomplete or biased at the same time.
- Behavioral logs record only observable actions and cannot fully explain user motivations; self-reports, interviews, and delayed reassessment are also needed.
- Random assignment, questionnaire management, de-identified export, recommendation-calibration annotation, and preregistration-analysis tools are not yet built in.
- Live-commerce-specific capabilities are outside the current research scope, as is the automated `G1 → G2 → G3` sales-language analysis pipeline.

## 13. Future Extensions

Future work can add:

- Randomized experiments with seller-agent, steward-agent, dual-agent, neutral-AI, and no-AI conditions.
- Purchase-appropriateness annotation rules for different product categories, along with multi-source evaluation by researchers, users, and independent assessors.
- Scales for impulse-buying tendency, budget pressure, post-decision regret, over-restraint, AI trust, and perceived autonomy.
- Visual interfaces for recommendation rationale, evidence sources, uncertainty, and agent disagreement.
- Follow-up questions after a delay about users’ needs, budget changes, and decision satisfaction, to distinguish helpful delay from unnecessary avoidance.
- Data export, de-identification, session-path visualization, and manual annotation of AI response quality.
- Comparative studies of different intervention timings, language styles, mini-game types, and task durations.

## 14. Implementation Scope

The current repository provides:

| Location | Research use |
| --- | --- |
| `view/` | Participant interface, AI interaction, decision support, pressure test, mini-games, and dashboard interface |
| `worker/src/modules/shop/` | Product samples and sample insights |
| `worker/src/modules/cart/` | Pending-purchase list |
| `worker/src/modules/order/` | Simulated decision records |
| `worker/src/modules/ai/` | Seller and steward agents |
| `worker/src/modules/research/` | Behavioral tracking, pressure profiles, and research aggregation |
| `worker/src/modules/admin/` | Research dashboard and AI configuration |
| `worker/store/migrations/` | Data schema and sample data |

The technical implementation serves the research question of “when is it appropriate to buy?” Before formally collecting data, researchers should record the project version, sample materials, AI prompts, experimental conditions, purchase-appropriateness criteria, and analysis plan, and first verify that dual-agent outputs do not systematically promote impulse purchases or over-restraint.

## 15. References and Links

The following works are the principal basis for this document’s theoretical claims and implementation constraints. Formal paper writing should still verify versions, page ranges, and citation style against the target venue.

1. Verplanken, B., & Herabadi, A. (2001). *Individual differences in impulse buying tendency: Feeling and no thinking*. European Journal of Personality, 15(S1), S71–S83. [https://doi.org/10.1002/per.423](https://doi.org/10.1002/per.423)
2. Dhar, R., & Wertenbroch, K. (2000). *Consumer choice between hedonic and utilitarian goods*. Journal of Marketing Research, 37(1), 60–71. [https://doi.org/10.1509/jmkr.37.1.60.18718](https://doi.org/10.1509/jmkr.37.1.60.18718)
3. Kivetz, R., & Simonson, I. (2002). *Self-control for the righteous: Toward a theory of precommitment to indulgence*. Journal of Consumer Research, 29(2), 199–217. [https://doi.org/10.1086/339925](https://doi.org/10.1086/339925)
4. Ajzen, I. (1991). *The theory of planned behavior*. Organizational Behavior and Human Decision Processes, 50(2), 179–211. [https://doi.org/10.1016/0749-5978(91)90020-T](https://doi.org/10.1016/0749-5978(91)90020-T)
5. Friestad, M., & Wright, P. (1994). *The persuasion knowledge model: How people cope with persuasion attempts*. Journal of Consumer Research, 21(1), 1–31. [https://doi.org/10.1086/209380](https://doi.org/10.1086/209380)
6. Deci, E. L., & Ryan, R. M. (2000). *The “what” and “why” of goal pursuits: Human needs and the self-determination of behavior*. Psychological Inquiry, 11(4), 227–268. [https://doi.org/10.1207/S15327965PLI1104_01](https://doi.org/10.1207/S15327965PLI1104_01)
7. Lee, J. D., & See, K. A. (2004). *Trust in automation: Designing for appropriate reliance*. Human Factors, 46(1), 50–80. [https://doi.org/10.1518/hfes.46.1.50_30392](https://doi.org/10.1518/hfes.46.1.50_30392)
8. Dietvorst, B. J., Simmons, J. P., & Massey, C. (2015). *Algorithm aversion: People erroneously avoid algorithms after seeing them err*. Journal of Experimental Psychology: General, 144(1), 114–126. [https://doi.org/10.1037/xge0000033](https://doi.org/10.1037/xge0000033)
