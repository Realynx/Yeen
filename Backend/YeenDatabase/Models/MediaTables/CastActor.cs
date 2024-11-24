﻿using System.ComponentModel.DataAnnotations;

namespace YeenDatabase.Models.MediaTables {
    public class CastActor {
        [Key]
        public Guid Id { get; set; }

        public string Name { get; set; }
        public string ProfilePicture { get; set; }
        public string About { get; set; }
    }
}
