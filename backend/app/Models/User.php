<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    protected $table = 'app_users';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'id',
        'name',
        'email',
        'password_hash',
        'role',
        'role_title',
        'office',
        'division',
        'position',
        'avatar_initials',
        'avatar_seed',
        'sidebar_modules',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password_hash',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sidebar_modules' => 'array',
        ];
    }

    public function getAuthPassword(): string
    {
        return $this->password_hash;
    }

    public function publicProfile(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'role' => $this->role,
            'roleTitle' => $this->role_title,
            'office' => $this->office,
            'division' => $this->division,
            'position' => $this->position,
            'avatarInitials' => $this->avatar_initials,
            'avatarSeed' => $this->avatar_seed ?: $this->id,
            'sidebarModules' => $this->sidebar_modules,
        ];
    }
}
