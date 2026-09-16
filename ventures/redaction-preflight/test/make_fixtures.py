import os
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import LETTER

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
W, H = LETTER

def base(c):
    c.setFont("Helvetica-Bold", 14)
    c.drawString(72, H - 90, "UNITED STATES DISTRICT COURT")
    c.setFont("Helvetica", 11)
    c.drawString(72, H - 112, "Case No. 1:26-cv-04417  |  Exhibit C  |  Produced under protective order")

# 1. Black box over live text  -> CRITICAL, text recoverable
c = canvas.Canvas(f"{OUT}/fail_blackbox.pdf", pagesize=LETTER)
c.setAuthor(""); c.setTitle(""); c.setSubject(""); c.setKeywords("")
base(c)
c.setFont("Helvetica", 12)
c.drawString(72, H - 170, "The informant was identified in sealed testimony as")
# secret text drawn FIRST, then covered by an opaque rect
c.drawString(72, H - 190, "SECRETNAME Gregory Halvorsen of 88 Wexford Lane")
c.setFillColorRGB(0, 0, 0)
c.rect(70, H - 196, 330, 18, fill=1, stroke=0)
c.setFillColorRGB(0, 0, 0)
c.drawString(72, H - 220, "and corroborated by two witnesses.")
c.save()

# 2. Metadata leakage -> author, keywords, local path in title
c = canvas.Canvas(f"{OUT}/fail_metadata.pdf", pagesize=LETTER)
c.setAuthor("m.delacroix@harlow-finch.com")
c.setTitle(r"C:\Users\mdelacroix\Drafts\Halvorsen-settlement-DRAFT-v7.docx")
c.setSubject("Privileged & Confidential - Attorney Work Product")
c.setKeywords("settlement, Halvorsen, do-not-produce, internal")
base(c)
c.setFont("Helvetica", 12)
c.drawString(72, H - 170, "The parties have reached agreement on all terms.")
c.save()

# 3. Annotation / comment leakage
c = canvas.Canvas(f"{OUT}/fail_annotations.pdf", pagesize=LETTER)
c.setAuthor(""); c.setTitle(""); c.setSubject(""); c.setKeywords("")
base(c)
c.setFont("Helvetica", 12)
c.drawString(72, H - 170, "Defendant denies all allegations in paragraph 14.")
c.textAnnotation("ANNOTSECRET do not produce this page - client admitted fault on the 3rd",
                 Rect=(400, H - 200, 440, H - 160), relative=0)
c.save()

# 4. Invisible text (render mode 3) - OCR layer / failed image redaction
c = canvas.Canvas(f"{OUT}/fail_invisible.pdf", pagesize=LETTER)
c.setAuthor(""); c.setTitle(""); c.setSubject(""); c.setKeywords("")
base(c)
c.setFont("Helvetica", 12)
c.drawString(72, H - 170, "[ page image redacted ]")
t = c.beginText(72, H - 200)
t.setFont("Helvetica", 12)
t.setTextRenderMode(3)  # invisible
t.textLine("INVISIBLESECRET account 4417-9920 routing 021000021")
c.drawText(t)
c.save()

# 5. PII in plain extractable text
c = canvas.Canvas(f"{OUT}/fail_pii.pdf", pagesize=LETTER)
c.setAuthor(""); c.setTitle(""); c.setSubject(""); c.setKeywords("")
base(c)
c.setFont("Helvetica", 12)
c.drawString(72, H - 170, "Claimant SSN 482-19-7734, DOB 03/14/1979")
c.drawString(72, H - 190, "Contact: r.halvorsen@example.com or (415) 555-0142")
c.drawString(72, H - 210, "Card on file 4111 1111 1111 1111")
c.save()

# 6. Genuinely clean control
c = canvas.Canvas(f"{OUT}/clean.pdf", pagesize=LETTER)
c.setAuthor(""); c.setTitle(""); c.setSubject(""); c.setKeywords("")
base(c)
c.setFont("Helvetica", 12)
c.drawString(72, H - 170, "All exhibits have been produced in accordance with the order.")
c.save()
print("generated")
