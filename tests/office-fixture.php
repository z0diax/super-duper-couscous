<?php
if (PHP_SAPI!=='cli') exit;
$archive=new PharData($argv[1],0,null,Phar::ZIP);
$archive['[Content_Types].xml']='<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" />';
$archive['word/document.xml']='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>';
