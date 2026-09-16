import os
import re
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
data = open(f"{OUT}/clean.pdf", "rb").read()

# last startxref offset = the previous revision's xref
prev = int(re.findall(rb"startxref\s+(\d+)\s+%%EOF\s*$", data)[-1][0] if False else re.findall(rb"startxref\s+(\d+)", data)[-1])
trailer = re.findall(rb"trailer\s*<<(.*?)>>", data, re.S)[-1]
size = int(re.search(rb"/Size\s+(\d+)", trailer).group(1))
root = int(re.search(rb"/Root\s+(\d+)\s+0\s+R", trailer).group(1))
m = re.search(rb"/Info\s+(\d+)\s+0\s+R", trailer)
info = int(m.group(1)) if m else size  # if no Info, add one as a fresh object

body = bytearray(data)
if not body.endswith(b"\n"):
    body += b"\n"

obj_off = len(body)
new_obj = (b"%d 0 obj\n<< /Title (REVISIONSECRET Halvorsen-settlement-UNREDACTED-v3) "
           b"/Author (m.delacroix@harlow-finch.com) >>\nendobj\n" % info)
body += new_obj

new_size = max(size, info + 1)
xref_off = len(body)
body += b"xref\n"
body += b"0 1\n0000000000 65535 f \n"
body += b"%d 1\n" % info
body += b"%010d 00000 n \n" % obj_off
body += (b"trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R /Prev %d >>\n"
         % (new_size, root, info, prev))
body += b"startxref\n%d\n%%%%EOF\n" % xref_off

open(f"{OUT}/fail_incremental.pdf", "wb").write(bytes(body))
print("eof_markers:", bytes(body).count(b"%%EOF"), "has_prev:", b"/Prev" in bytes(body))
