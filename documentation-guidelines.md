# How Documentation Should Be Done

---

## 1. Purpose

Documentation exists to:

* Reduce onboarding time
* Preserve architectural intent
* Prevent knowledge loss
* Enable safe modification of the system

Documentation does **not** exist to:

* Market features
* Speculate about the future
* Sound impressive
* Replace clarity with verbosity

Clarity over persuasion.
Accuracy over enthusiasm.
Precision over volume.

---

## 2. Truthfulness and Verification

### 2.1 No Speculative Content

Documentation MUST reflect only verified, implemented behavior.

Do NOT document:

* Planned features
* Roadmap ideas
* Assumed behavior
* Hypothetical endpoints
* Unimplemented flows

If future work must be referenced, it MUST be labeled clearly:

> Planned (Not Implemented)

---

### 2.2 Code Is the Source of Truth

All technical documentation MUST align exactly with the implementation.

* Use real function names
* Use actual parameter names
* Match true return structures
* Match real error formats
* Verify examples against working code

If documentation and code conflict, documentation must be corrected immediately.

---

### 2.3 No Assumed Behavior

Do not document behavior that has not been verified directly in the source code.

If uncertain, confirm before writing.

---

## 3. Brevity and Density

Documentation MUST be concise.

* Prefer structured bullets over long paragraphs
* Avoid repetition
* Avoid background storytelling unless necessary
* Remove sections that do not add clarity

If a section can be removed without reducing understanding, remove it.

Short and precise is superior to long and impressive.

---

## 4. Tone and Professional Standards

Documentation MUST:

* Use neutral, technical language
* Avoid promotional phrasing
* Avoid exaggerated claims
* Avoid urgency-driven language
* Avoid emotional or persuasive wording

The tone must reflect calm engineering confidence.

### 4.1 Prohibited Elements

* No emojis in formal documentation
* No slang
* No marketing-style adjectives
* No hype language
* No "—" characters, use standard punctuation such as commas or periods.

---

## 5. Architectural Integrity Requirements

System-level documentation MUST include:

### 5.1 Intent

* What problem is solved
* Why this solution exists

### 5.2 Responsibilities

* What this component is responsible for

### 5.3 Non-Goals

* What it explicitly does NOT do

### 5.4 Constraints

* Performance limits
* Platform assumptions
* Memory/runtime boundaries

### 5.5 Failure Modes (When Applicable)

* Known failure scenarios
* Error handling behavior
* Recovery expectations

Architecture without documented constraints becomes unstable.

---

## 6. Formatting Standards

Formatting exists to increase clarity and consistency.

### 6.1 Headers

Formal specification documents MUST include:

```txt
# Document Title

**Version:** X.Y  
**Date:** Month DD, YYYY  
**Author:** Name
```

Other document types may omit versioning if not required.

---

## 6.2 Section Structure

* Use numbered sections for specifications
* Maintain consistent hierarchy (`##`, `###`)
* Do not skip numbering
* Avoid decorative separators unless necessary

---

### 6.3 Code Blocks

* Always include a language identifier
* Ensure examples are syntactically correct
* Add spacing for readability
* Use realistic data

Incorrect formatting reduces clarity and trust.

---

### 6.4 Lists

* Use `-` for unordered lists
* Use numbered lists for sequential steps
* Maintain consistent indentation
* Avoid deeply nested structures unless necessary

---

### 6.5 Emphasis Rules

* Use **bold** for important terms
* Use `code formatting` for:

  * Function names
  * File paths
  * Endpoints
  * Types
  * Variables

Avoid excessive styling.

---

## 7. Documentation Categories

All documents must identify their type:

* Specification
* Concept
* Guide
* ADR (Decision Record)
* Reference

Different document types serve different purposes.
Do not mix purposes within a single document.

---

## 8. Removal and Evolution Rule

Stale documentation is worse than no documentation.

If behavior changes:

* Update the document immediately
* Or remove outdated sections

Breaking changes must clearly document impact.

---

## 9. Onboarding Standard

Documentation must optimize for this outcome:

> A competent engineer can understand the system and begin working without external explanation.

If documentation increases confusion, it must be simplified.
