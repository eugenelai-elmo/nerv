// Fictional Bloom responses. Shapes match live Bloom (keys verified 2026-10-08); no real people or data.
export const PERF_ID = 1001

export const overview = {
  id: PERF_ID,
  title: 'Performance Appraisal FY27 - Alex Example',
  employee: { id: 77, fullName: 'Alex Example' },
  manager: { id: 1, fullName: 'Morgan Manager' },
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  progressStatus: { id: 2, text: 'In Progress' },
}

export const sections = [
  { id: 11, type: 'question', title: 'Individual Goals & Objectives' },
  { id: 12, type: 'question', title: 'Career Aspirations, Interests & Strengths' },
  { id: 13, type: 'development', title: 'Individual Development Plan (IDP)' },
  { id: 14, type: 'summary', title: 'Final Review & Rating' },
  { id: 15, type: 'recommendation', title: 'Recognition' },
]

export const goalsSection = {
  title: 'Individual Goals & Objectives',
  status: 'In Progress',
  type: 'question',
  detailsUrl: 'https://bloom.example.test/details/11',
  startDate: '2026-07-01',
  managerRating: null,
  items: [
    { id: 101, title: 'Enter Individual Goals & Objectives Below', description: null, type: 'text',
      responses: [{ id: 1, author: 'employee', value: ['Ship the theming engine', 'Mentor a junior'], reviewer: { id: 1, fullName: 'Morgan Manager' } }] },
  ],
}

export const careerSection = {
  title: 'Career Aspirations, Interests & Strengths',
  status: 'Not Started',
  items: [
    { id: 201, title: 'My Career Aspirations and Interests (enter 2-3)', type: 'text', responses: [] },
    { id: 202, title: 'My Top Strengths (enter 2-3)', type: 'text', responses: [{ id: 2, author: 'employee', value: ['Debugging'], reviewer: null }] },
    { id: 203, title: 'My Top Development Areas (enter 2-3)', type: 'text', responses: [] },
  ],
}

export const idpSection = {
  title: 'Individual Development Plan (IDP)',
  items: [
    { id: 301, title: 'Grow system design skills', description: 'Lead one design review', label: { id: 4, title: 'Technical', description: null },
      actions: [
        { id: 1, title: 'Run an arch guild session', checked: true, progressType: { id: 1 }, course: null },
        { id: 2, title: 'Pair on a design doc', checked: false, progressType: { id: 1 }, course: null },
      ], weight: null, ratings: [] },
  ],
}

export const finalSection = {
  title: 'Final Review & Rating',
  status: 'Not Started',
  items: [],
  detailsUrl: 'https://bloom.example.test/details/14',
  managerRating: 3,
  managerRatingForLabel: 'Meets expectations',
  employeeRating: null,
}

export const recognitionSection = { title: 'Recognition', items: [] }

export const notesFor101 = [{ id: 9, value: 'Good progress in Q1', author: { fullName: 'Morgan Manager' } }]
