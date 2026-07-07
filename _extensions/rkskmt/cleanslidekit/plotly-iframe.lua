function Div(el)
  if el.classes:includes("plotly-iframe") then
    local src = el.attributes.src
    local width = el.attributes.width or "900"
    local height = el.attributes.height or "520"

    local html = string.format([[
<div style="display:flex; justify-content:center;">
<iframe src="%s" width="%s" height="%s" style="border:none;" onload="try{var d=this.contentDocument;if(d){d.documentElement.style.margin='0';d.documentElement.style.padding='0';d.body.style.margin='0';d.body.style.padding='0';}}catch(e){}"></iframe>
</div>]], src, width, height)

    return pandoc.RawBlock("html", html)
  end
end
