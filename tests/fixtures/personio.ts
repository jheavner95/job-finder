export const personioSingleJob = `<?xml version="1.0" encoding="UTF-8"?>
<workzag-jobs>
  <position>
    <id>4103</id>
    <subcompany>Example Products GmbH</subcompany>
    <office>Chicago</office>
    <department>Product</department>
    <recruitingCategory>Design</recruitingCategory>
    <name>Staff Product Designer</name>
    <jobDescriptions>
      <jobDescription>
        <name>What you will do</name>
        <value><![CDATA[<p>Lead enterprise product design strategy.</p>]]></value>
      </jobDescription>
      <jobDescription>
        <name>What you bring</name>
        <value><![CDATA[<p>Eight years of product design experience.</p>]]></value>
      </jobDescription>
    </jobDescriptions>
    <employmentType>permanent</employmentType>
    <seniority>experienced</seniority>
    <schedule>full-time</schedule>
    <yearsOfExperience>7-10</yearsOfExperience>
    <keywords>product design,enterprise</keywords>
    <occupation>product_designer</occupation>
    <occupationCategory>design</occupationCategory>
  </position>
</workzag-jobs>`;

export const personioMultipleJobs = `<?xml version="1.0"?>
<workzag-jobs>
  <position>
    <id>4103</id><office>Chicago</office><department>Product</department>
    <name>Staff Product Designer</name>
    <jobDescriptions><jobDescription><name>Role</name><value>Design systems.</value></jobDescription></jobDescriptions>
    <employmentType>permanent</employmentType><schedule>full-time</schedule>
  </position>
  <position>
    <id>4104</id><office>Berlin</office><department>Research</department>
    <name>Senior UX Researcher</name>
    <jobDescriptions><jobDescription><name>Role</name><value>Lead research programs.</value></jobDescription></jobDescriptions>
    <employmentType>permanent</employmentType><schedule>part-time</schedule>
  </position>
</workzag-jobs>`;

export const personioMissingOptionalFields = `<?xml version="1.0"?>
<workzag-jobs>
  <position>
    <id>5001</id>
    <name>Product Designer</name>
    <jobDescriptions><jobDescription><value>Design a complex product.</value></jobDescription></jobDescriptions>
  </position>
</workzag-jobs>`;

export const personioEmptyFeed = `<?xml version="1.0"?><workzag-jobs></workzag-jobs>`;

export const personioDuplicateIds = `<?xml version="1.0"?>
<workzag-jobs>
  <position><id>7</id><name>Designer I</name></position>
  <position><id>7</id><name>Designer II</name></position>
</workzag-jobs>`;

export const personioMalformedFeed =
  `<workzag-jobs><position><id>7</id><name>Designer</position></workzag-jobs>`;
