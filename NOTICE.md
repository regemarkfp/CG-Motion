# Third-party notices

## Affinity file reader

`app/js/affinity.js`, `app/js/afmodel.js` and `app/js/afimport.js` read Affinity documents
(.af, .afdesign, .afphoto, .afpub, .aftemplate). Affinity has no published file format. This
reader was written for CG Motion from these public, permissively licensed descriptions:

- **VMDevCpp/afread**: library for reading Affinity files. MIT License, Copyright (c) 2020 Vladimir Mamonov.
  https://github.com/VMDevCpp/afread
- **storytold/vectorcraft**, `crates/affinity`: a reader for native Affinity documents.
  Dual-licensed MIT / Apache-2.0. https://github.com/storytold/vectorcraft

No Affinity software, code or assets are part of CG Motion. Nothing is written in Affinity's format.

## Zstandard decoder

`app/js/zstd.js` is a decoder written for CG Motion from the Zstandard format specification
(RFC 8878, https://www.rfc-editor.org/rfc/rfc8878).

## MIT License (afread, vectorcraft)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
