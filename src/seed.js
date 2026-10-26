// Seed data for the in-memory store.
// Populated with realistic user profiles, orders, sessions, and bookings for the Admin Panel.
module.exports = {
  users: [
    {
      id: "U101",
      name: "Sratanshu Shukla",
      email: "sratanshushukla135@gmail.com",
      phone: "+91 63936 20028",
      city: "Kanpur",
      gotra: "Shandilya",
      orders: 6,
      wallet: 4500,
      status: "Active",
      createdAt: "2026-09-15T10:30:00.000Z",
      lastActive: "2026-10-21T11:45:00.000Z",
      address: "14/22 Civil Lines, Near Green Park, Kanpur"
    },
    {
      id: "U102",
      name: "Ayush Sharma",
      email: "ayush.sharma9454@gmail.com",
      phone: "+91 94540 88776",
      city: "Varanasi",
      gotra: "Kashyap",
      orders: 14,
      wallet: 2800,
      status: "Active",
      createdAt: "2026-08-10T14:20:00.000Z",
      lastActive: "2026-10-21T09:12:00.000Z",
      address: "B-24 Assi Ghat Road, Varanasi"
    },
    {
      id: "U103",
      name: "Priya Verma",
      email: "priya.verma21@gmail.com",
      phone: "+91 98390 44551",
      city: "Lucknow",
      gotra: "Bharadwaj",
      orders: 8,
      wallet: 1750,
      status: "Active",
      createdAt: "2026-09-01T08:15:00.000Z",
      lastActive: "2026-10-20T16:30:00.000Z",
      address: "Flat 402, Gomti Nagar Phase 2, Lucknow"
    },
    {
      id: "U104",
      name: "Rahul Tiwari",
      email: "rahul.tiwari@outlook.com",
      phone: "+91 91234 56789",
      city: "Delhi NCR",
      gotra: "Vatsa",
      orders: 3,
      wallet: 920,
      status: "Active",
      createdAt: "2026-10-02T11:00:00.000Z",
      lastActive: "2026-10-21T07:50:00.000Z",
      address: "Sector 62, Noida, Gautam Buddha Nagar"
    },
    {
      id: "U105",
      name: "Ananya Mishra",
      email: "ananya.mishra@yahoo.com",
      phone: "+91 98765 12340",
      city: "Prayagraj",
      gotra: "Garg",
      orders: 11,
      wallet: 3400,
      status: "Active",
      createdAt: "2026-07-22T09:40:00.000Z",
      lastActive: "2026-10-19T18:22:00.000Z",
      address: "12 Tagore Town, Near University Road, Prayagraj"
    },
    {
      id: "U106",
      name: "Vikramaditya Rathore",
      email: "vikram.rathore@gmail.com",
      phone: "+91 87654 32109",
      city: "Ayodhya",
      gotra: "Suryavanshi",
      orders: 5,
      wallet: 5100,
      status: "Active",
      createdAt: "2026-08-30T13:10:00.000Z",
      lastActive: "2026-10-21T10:05:00.000Z",
      address: "Ram Ki Paidi Marg, Ayodhya Dham"
    },
    {
      id: "U107",
      name: "Sunita Agarwal",
      email: "sunita.agarwal@gmail.com",
      phone: "+91 97980 55432",
      city: "Kanpur",
      gotra: "Garg",
      orders: 2,
      wallet: 350,
      status: "Blocked",
      createdAt: "2026-09-18T16:50:00.000Z",
      lastActive: "2026-10-15T12:00:00.000Z",
      address: "Swaroop Nagar, Kanpur"
    },
    {
      id: "U108",
      name: "Amitabh Pandey",
      email: "amitabh.pandey@gmail.com",
      phone: "+91 94150 33221",
      city: "Varanasi",
      gotra: "Parashar",
      orders: 9,
      wallet: 2150,
      status: "Active",
      createdAt: "2026-08-05T07:20:00.000Z",
      lastActive: "2026-10-21T08:30:00.000Z",
      address: "Durgakund Road, Near Sankat Mochan, Varanasi"
    }
  ],
  vendors: [],
  bookings: [],
  jobs: [],
  orders: [
    {
      id: "ORD-901",
      buyer: "Sratanshu Shukla",
      item: "Vaidic Maha Pooja Samagri Kit",
      merchant: "Shri Kashi Puja Store",
      amt: 1850,
      status: "Delivered",
      city: "Kanpur",
      createdAt: "2026-10-18T14:30:00.000Z"
    },
    {
      id: "ORD-902",
      buyer: "Ayush Sharma",
      item: "Pure Brass Panchaarti Diya",
      merchant: "Ayodhya Mandir Store",
      amt: 850,
      status: "Ready for Courier",
      city: "Varanasi",
      createdAt: "2026-10-19T11:15:00.000Z"
    },
    {
      id: "ORD-903",
      buyer: "Priya Verma",
      item: "Original 5 Mukhi Rudraksha Mala (108 Beads)",
      merchant: "Kashi Vishwanath Trust",
      amt: 1200,
      status: "Packed",
      city: "Lucknow",
      createdAt: "2026-10-20T16:40:00.000Z"
    },
    {
      id: "ORD-904",
      buyer: "Rahul Tiwari",
      item: "Copper Havan Kund with Stand (9 Inch)",
      merchant: "Shri Kashi Puja Store",
      amt: 1450,
      status: "New",
      city: "Delhi NCR",
      createdAt: "2026-10-21T08:20:00.000Z"
    }
  ],
  products: [
    {
      id: "PRD-1",
      name: "Vaidic Maha Pooja Samagri Kit",
      price: 1850,
      mrp: 2400,
      category: "kits",
      categoryName: "Pooja Kits",
      stock: 45,
      image: "https://images.unsplash.com/photo-1609234656388-0ff363383899?w=600&auto=format&fit=crop&q=80",
      imageUrl: "https://images.unsplash.com/photo-1609234656388-0ff363383899?w=600&auto=format&fit=crop&q=80",
      images: [
        "https://images.unsplash.com/photo-1609234656388-0ff363383899?w=600&auto=format&fit=crop&q=80"
      ],
      merchant: "Shri Kashi Puja Store",
      rating: 4.9,
      reviewsCount: 24,
      description: "Certified collection of 36 authentic Vedic items for Satyanarayan Katha, Rudrabhishek, and Griha Pravesh. Includes Gangajal, Kasturi, Roli, Akshat, Dhoop, and Camphor.",
      significance: "100% pure and authentic Vedic materials.",
      isKit: true,
      status: "Live",
      variants: [
        {
          id: "v-prd-1",
          name: "Complete Kit (36 Items)",
          price: 1850,
          mrp: 2400,
          stock: 45
        }
      ]
    },
    {
      id: "PRD-2",
      name: "Pure Brass Panchaarti Diya",
      price: 850,
      mrp: 1250,
      category: "diya",
      categoryName: "Diyas & Deepam",
      stock: 30,
      image: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&auto=format&fit=crop&q=80",
      imageUrl: "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&auto=format&fit=crop&q=80",
      images: [
        "https://images.unsplash.com/photo-1514565131-fce0801e5785?w=600&auto=format&fit=crop&q=80"
      ],
      merchant: "Ayodhya Mandir Store",
      rating: 4.8,
      reviewsCount: 18,
      description: "Handcrafted pure brass Panchaarti Diya with traditional engraving. Auspicious for daily evening prayers and temple rituals.",
      significance: "Panchaarti Diya helps remove negative energy and brings peace.",
      isKit: false,
      status: "Live",
      variants: [
        {
          id: "v-prd-2",
          name: "Medium Size (250g)",
          price: 850,
          mrp: 1250,
          stock: 30
        }
      ]
    },
    {
      id: "PRD-3",
      name: "Original 5 Mukhi Rudraksha Mala",
      price: 1200,
      mrp: 1800,
      category: "mala",
      categoryName: "Rudraksha & Japa Mala",
      stock: 80,
      image: "https://images.unsplash.com/photo-1620619767323-b95a89183081?w=600&auto=format&fit=crop&q=80",
      imageUrl: "https://images.unsplash.com/photo-1620619767323-b95a89183081?w=600&auto=format&fit=crop&q=80",
      images: [
        "https://images.unsplash.com/photo-1620619767323-b95a89183081?w=600&auto=format&fit=crop&q=80"
      ],
      merchant: "Kashi Vishwanath Trust",
      rating: 5.0,
      reviewsCount: 56,
      description: "Original 5 Mukhi Rudraksha beads from Nepal, consecrated with Vedic mantras at Kashi Vishwanath for daily japa and meditation.",
      significance: "Best for Mahamrityunjaya and Shiva Panchakshara mantra chanting.",
      isKit: false,
      status: "Live",
      variants: [
        {
          id: "v-prd-3",
          name: "108 Beads (8mm)",
          price: 1200,
          mrp: 1800,
          stock: 80
        }
      ]
    }
  ],
  sessions: [
    {
      id: "SES-501",
      astro: "आचार्य विद्याधर जोशी",
      user: "Sratanshu Shukla",
      mode: "Chat",
      mins: 18,
      amt: 450,
      status: "Completed",
      createdAt: "2026-10-20T15:00:00.000Z"
    },
    {
      id: "SES-502",
      astro: "पं. देवेन्द्र शास्त्री",
      user: "Priya Verma",
      mode: "Call",
      mins: 25,
      amt: 750,
      status: "Completed",
      createdAt: "2026-10-20T18:30:00.000Z"
    },
    {
      id: "SES-503",
      astro: "आचार्य विद्याधर जोशी",
      user: "Ayush Sharma",
      mode: "Video",
      mins: 30,
      amt: 1100,
      status: "Active",
      createdAt: "2026-10-21T10:15:00.000Z"
    }
  ],
  subs: [
    {
      id: "SUB-101",
      user: "Sratanshu Shukla",
      plan: "Daily Nitya Sandhya Aarti",
      pandit: "पं. शशिकांत शास्त्री",
      frequency: "Daily",
      amt: 999,
      status: "Active",
      startDate: "2026-10-01"
    },
    {
      id: "SUB-102",
      user: "Ayush Sharma",
      plan: "Ganesh Atharvashirsha Weekly Seva",
      pandit: "पं. शशिकांत शास्त्री",
      frequency: "Weekly",
      amt: 1499,
      status: "Active",
      startDate: "2026-10-05"
    }
  ],
  temples: [
    {
      id: "kashi_vishwanath",
      name: "Kashi Vishwanath Temple",
      city: "Varanasi",
      state: "Uttar Pradesh",
      deity: "Lord Shiva",
      description: "One of the most sacred Jyotirlingas located on the holy ghats of the Ganga."
    },
    {
      id: "somnath_mandir",
      name: "Somnath Mahadev Temple",
      city: "Prabhas Patan",
      state: "Gujarat",
      deity: "Lord Shiva",
      description: "The first among the twelve Jyotirlinga shrines of Shiva."
    }
  ],
  donations: [
    {
      id: "DON-301",
      user: "Sratanshu Shukla",
      temple: "Kashi Vishwanath Temple",
      amt: 2100,
      cause: "Annadaan Seva",
      status: "Received",
      createdAt: "2026-10-17T09:30:00.000Z"
    },
    {
      id: "DON-302",
      user: "Ayush Sharma",
      temple: "Somnath Mahadev Temple",
      amt: 5100,
      cause: "Shiva Mandir Goshala",
      status: "Received",
      createdAt: "2026-10-19T14:00:00.000Z"
    }
  ],
  events: [],
  payouts: [],
  reviews: [
    {
      id: "REV-201",
      reviewer: "Sratanshu Shukla",
      vendor: "पं. शशिकांत शास्त्री",
      rating: 5,
      comment: "उत्कृष्ट वैदिक विधि विधान से सत्यनारायण कथा संपन्न कराई गई। अत्यंत प्रसन्नता हुई।",
      status: "Approved",
      createdAt: "2026-10-20T17:00:00.000Z"
    },
    {
      id: "REV-202",
      reviewer: "Ayush Sharma",
      vendor: "पं. शशिकांत शास्त्री",
      rating: 5,
      comment: "Very punctual and knowledgeable pandit ji. Explained all mantras and vidhi clearly.",
      status: "Approved",
      createdAt: "2026-10-21T06:30:00.000Z"
    }
  ],
  library: [],
  banners: [],
};
