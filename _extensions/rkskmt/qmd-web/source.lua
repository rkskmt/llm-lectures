-- qmd web: name the source a deck was rendered from.
--
-- The editor's live preview rebuilds the slides that differ between what a
-- published deck was rendered from and the saved file. A deck rendered
-- anywhere (a PC, a server) carries the git blob SHA of its qmd, which the
-- editor reads back from GitHub. Written as
-- <meta name="qmd-web-source" content="...">; the deck's bridge.js passes it on.
--
-- A checkout that converts line endings (Windows with core.autocrlf, or a
-- .gitattributes eol rule) holds CRLF where git stores LF. A file with CRLF
-- therefore names two SHAs, of its LF text and of its bytes as they are; the
-- editor takes the one GitHub has.

local function git_blob_sha(text)
  return pandoc.utils.sha1("blob " .. #text .. "\0" .. text)
end

local function source_shas(text)
  local shas = git_blob_sha(text)
  if text:find("\r\n", 1, true) then
    shas = git_blob_sha((text:gsub("\r\n", "\n"))) .. " " .. shas
  end
  return shas
end

function Meta(meta)
  if not quarto.doc.is_format("revealjs") then return nil end
  local path = quarto.doc.input_file
  local file = path and io.open(path, "rb")
  if not file then return nil end
  local text = file:read("a")
  file:close()
  quarto.doc.include_text("in-header",
    '<meta name="qmd-web-source" content="' .. source_shas(text) .. '">')
  return nil
end
