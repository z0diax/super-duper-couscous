<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('app_users')) {
            return;
        }

        Schema::create('app_users', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('email', 190)->unique();
            $table->string('password_hash');
            $table->string('name', 160);
            $table->string('role', 64);
            $table->string('role_title', 160);
            $table->string('office', 190);
            $table->string('division', 190);
            $table->string('position', 190);
            $table->string('avatar_initials', 8);
            $table->string('avatar_seed', 190)->nullable();
            $table->text('sidebar_modules')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        // app_users is shared with the legacy API and must never be removed by Laravel.
    }
};
